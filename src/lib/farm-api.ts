import { supabase } from "@/integrations/supabase/client";

const getFunctionUrl = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  return `${url}/functions/v1/farm-proxy`;
};

const getHeaders = () => ({
  "Content-Type": "application/json",
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

export interface StockResponse {
  total: number;
  active: number;
  activeWithBonus: number;
  proxies: { total: number; available: number; reserved: number };
  capacity: { maxConcurrent: number; active: number; waiting: number; queued: number; available: number };
}

export interface CreateResponse {
  farmId: string;
  status: string;
  masterEmail?: string;
  credits: number;
  slavesCount?: number;
  queued: boolean;
  queuePosition?: number;
  message: string;
  expiresIn?: string;
}

export interface FarmStatus {
  id: string;
  status: string;
  masterEmail?: string;
  workspaceId?: string;
  workspaceName?: string;
  credits: number;
  result?: {
    success: boolean;
    credits: number;
    attempted: number;
    claimSuccess: number;
    claimFailed: number;
    inviteFailed: number;
    removed: number;
    message: string;
    /** @deprecated use claimFailed */
    failed?: number;
  };
  logs?: Array<{ message: string; type: string; timestamp: number }>;
  createdAt?: number;
  completedAt?: number;
  lastUpdate?: number;
  runningFor?: string;
}

export type SSEEvent =
  | { type: "snapshot"; status: string; masterEmail?: string; credits: number; logs?: Array<{ message: string; logType: string; timestamp: number }>; [key: string]: unknown }
  | { type: "status"; status: string; workspaceId?: string; workspaceName?: string }
  | { type: "progress"; message: string; logType?: string; eventId?: string }
  | { type: "completed"; result: FarmStatus["result"] }
  | { type: "error"; error: string }
  | { type: "expired"; message: string }
  | { type: "cancelled"; message: string }
  | { type: "polling"; message: string; elapsed: number }
  | { type: "heartbeat"; timestamp: number };

export async function fetchStock(): Promise<StockResponse> {
  const res = await fetch(`${getFunctionUrl()}?action=stock`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to fetch stock");
  return res.json();
}

export async function createFarm(credits: number): Promise<CreateResponse> {
  const res = await fetch(`${getFunctionUrl()}?action=create`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ credits }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create farm");
  }
  return res.json();
}

export async function getFarmStatus(farmId: string): Promise<FarmStatus> {
  const res = await fetch(`${getFunctionUrl()}?action=status&farmId=${farmId}`, { headers: getHeaders() });
  if (!res.ok) {
    if (res.status === 404) throw new Error("SESSION_LOST");
    throw new Error("Failed to get status");
  }
  return res.json();
}

export async function cancelFarm(farmId: string): Promise<void> {
  const res = await fetch(`${getFunctionUrl()}?action=cancel&farmId=${farmId}`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to cancel");
}

// Cache the API key so we only fetch it once per session
let cachedApiKey: string | null = null;

async function getUpstreamApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const res = await fetch(`${getFunctionUrl()}?action=apikey`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to get API key");
  const data = await res.json();
  cachedApiKey = data.apiKey;
  return data.apiKey;
}

const UPSTREAM_SSE_BASE = "https://api.lovablextensao.shop";

export function connectSSE(
  farmId: string,
  onEvent: (event: SSEEvent) => void,
  onError: (err: Error) => void
): () => void {
  let aborted = false;

  const connect = async () => {
    try {
      const apiKey = await getUpstreamApiKey();
      // Connect DIRECTLY to upstream — no edge function timeout
      const url = `${UPSTREAM_SSE_BASE}/farm/events/${farmId}?apiKey=${apiKey}`;
      console.log(`[SSE] Connecting directly to upstream: ${farmId}`);

      const res = await fetch(url);
      if (!res.ok || !res.body) {
        throw new Error(`SSE connection failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log(`[SSE-RAW] type=${data.type}`, data.type === "progress" ? `eventId=${data.eventId} logType=${data.logType} msg="${data.message}"` : data.type === "snapshot" ? `status=${data.status} logs=${data.logs?.length ?? 0}` : data.type === "completed" ? `result=${JSON.stringify(data.result)}` : JSON.stringify(data));
              onEvent(data);
            } catch {}
          }
        }
      }

      // If stream ended naturally and not aborted, reconnect
      if (!aborted) {
        console.log(`[SSE] Stream ended, reconnecting in 2s...`);
        setTimeout(connect, 2000);
      }
    } catch (err) {
      if (!aborted) {
        console.warn(`[SSE] Error, retrying in 5s:`, err);
        onError(err instanceof Error ? err : new Error("SSE error"));
        setTimeout(connect, 5000);
      }
    }
  };

  connect();

  return () => {
    aborted = true;
  };
}
