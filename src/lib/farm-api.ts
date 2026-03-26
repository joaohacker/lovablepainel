// Backend removed — types kept for interface compatibility

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
  throw new Error("Backend removed");
}

export async function createFarm(_credits: number): Promise<CreateResponse> {
  throw new Error("Backend removed");
}

export async function getFarmStatus(_farmId: string, _token?: string, _signal?: AbortSignal): Promise<FarmStatus> {
  throw new Error("Backend removed");
}

export async function cancelFarm(_farmId: string, _token?: string): Promise<void> {
  throw new Error("Backend removed");
}
