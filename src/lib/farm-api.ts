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

export async function getFarmStatus(farmId: string, token?: string, signal?: AbortSignal): Promise<FarmStatus> {
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
  const res = await fetch(`${getFunctionUrl()}?action=status&farmId=${farmId}${tokenParam}`, { headers: getHeaders(), signal });
  if (!res.ok) {
    if (res.status === 404) throw new Error("SESSION_LOST");
    throw new Error("Failed to get status");
  }
  return res.json();
}

export async function cancelFarm(farmId: string, token?: string): Promise<void> {
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
  const res = await fetch(`${getFunctionUrl()}?action=cancel&farmId=${farmId}${tokenParam}`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to cancel");
}

// SSE removed — using polling only for security (no API key exposure)
