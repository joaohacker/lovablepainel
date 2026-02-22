import { useState, useCallback, useRef, useEffect } from "react";
import {
  createFarm,
  cancelFarm,
  getFarmStatus,
  type CreateResponse,
  type FarmStatus,
} from "@/lib/farm-api";

export type FarmState =
  | "idle"
  | "creating"
  | "queued"
  | "waiting_invite"
  | "running"
  | "completed"
  | "error"
  | "expired"
  | "cancelled";

export interface FeedEntry {
  id: number;
  eventId?: string;
  kind: "credit" | "warning" | "info" | "success";
  botName?: string;
  credits?: number;
  message: string;
  timestamp: number;
  arrivedAt?: number;
}

interface FarmGenerationState {
  state: FarmState;
  farmId: string | null;
  masterEmail: string | null;
  queuePosition: number | null;
  workspaceName: string | null;
  creditsEarned: number;
  totalCreditsRequested: number;
  result: FarmStatus["result"] | null;
  errorMessage: string | null;
  logs: string[];
  feed: FeedEntry[];
  expiresAt: number | null;
}

let feedIdCounter = 0;

function parseLogToFeedEntry(message: string, logType: string, timestamp: number, eventId?: string): FeedEntry {
  if (logType === "credit") {
    const nameMatch = message.match(/\((.+?)\)/);
    const botName = nameMatch ? nameMatch[1] : "Bot";
    // Always 5 credits per credit event
    return { id: ++feedIdCounter, eventId, kind: "credit", botName, credits: 5, message, timestamp };
  }
  if (logType === "warning") {
    return { id: ++feedIdCounter, eventId, kind: "warning", message, timestamp };
  }
  if (logType === "success") {
    return { id: ++feedIdCounter, eventId, kind: "success", message, timestamp };
  }
  return { id: ++feedIdCounter, eventId, kind: "info", message, timestamp };
}

export function useFarmGeneration(accessToken?: string) {
  const [gen, setGen] = useState<FarmGenerationState>({
    state: "idle",
    farmId: null,
    masterEmail: null,
    queuePosition: null,
    workspaceName: null,
    creditsEarned: 0,
    totalCreditsRequested: 0,
    result: null,
    errorMessage: null,
    logs: [],
    feed: [],
    expiresAt: null,
  });

  // Track processed eventIds to prevent duplicates
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  // Track consecutive 404 errors for retry logic
  const consecutive404Ref = useRef(0);
  const MAX_404_RETRIES = 3;
  // Flag to stop processing after completed
  const completedRef = useRef(false);
  // AbortController to cancel in-flight fetch requests on new generation
  const abortRef = useRef<AbortController | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startPollingRef = useRef<((farmId: string) => void) | null>(null);
  const startExpirationTimerRef = useRef<((expiresAt: number) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    // Abort any in-flight poll request to prevent stale data from overwriting state
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Auto-expire if expiresAt passes and generation never started running
  const expirationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startExpirationTimer = useCallback((expiresAt: number) => {
    if (expirationTimerRef.current) clearTimeout(expirationTimerRef.current);
    const delay = Math.max(0, expiresAt - Date.now());
    expirationTimerRef.current = setTimeout(() => {
      setGen((prev) => {
        if (prev.state === "waiting_invite" || prev.state === "queued") {
          cleanup();
          completedRef.current = true;
          return { ...prev, state: "expired", errorMessage: "Tempo esgotado sem detectar workspace. Seus créditos serão reembolsados automaticamente." };
        }
        return prev;
      });
    }, delay);
  }, [cleanup]);

  // Keep refs updated
  useEffect(() => { startExpirationTimerRef.current = startExpirationTimer; }, [startExpirationTimer]);

  useEffect(() => {
    return () => {
      if (expirationTimerRef.current) clearTimeout(expirationTimerRef.current);
    };
  }, []);

  // Track polling interval for adaptive backoff
  const pollCountRef = useRef(0);

  // Polling-only approach (no SSE — avoids API key exposure and edge function timeouts)
  const startPolling = useCallback(
    (farmId: string) => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
      // Create a new AbortController for this polling session
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const getInterval = () => {
        const count = pollCountRef.current;
        // First 5 polls: 10s, next 15: 12s, after that: 15s
        if (count < 5) return 10000;
        if (count < 20) return 12000;
        return 15000;
      };

      const schedulePoll = () => {
        pollingRef.current = setTimeout(async () => {
          pollCountRef.current++;

          if (completedRef.current || controller.signal.aborted) {
            pollingRef.current = null;
            return;
          }

          try {
            const status = await getFarmStatus(farmId, accessToken, controller.signal);
            // Double-check abort after async call returns
            if (controller.signal.aborted) return;
            consecutive404Ref.current = 0;
            console.log(`[POLLING] interval=${getInterval()}ms, status=${status.status}, logs=${status.logs?.length ?? 0}, credits_field=${status.credits}, result_credits=${status.result?.credits ?? 'N/A'}`);

            // Reset backoff when running (activity detected)
            if (status.status === "running" || status.status === "workspace_detected") {
              pollCountRef.current = Math.min(pollCountRef.current, 10);
            }

            // Terminal states
            if (status.status === "completed") {
              pollingRef.current = null;
              completedRef.current = true;

              const finalEntries: FeedEntry[] = [];
              let totalCreditsFromLogs = 0;
              if (status.logs && status.logs.length > 0) {
                for (const log of status.logs) {
                  const eid = (log as any).eventId || `${log.message}|${log.timestamp}`;
                  const entry = parseLogToFeedEntry(log.message, log.type, log.timestamp, eid);
                  finalEntries.push(entry);
                  if (entry.kind === "credit" && entry.credits) {
                    totalCreditsFromLogs += entry.credits;
                  }
                }
              }

              setGen((prev) => {
                const brandNew = finalEntries.filter((e) => !processedEventIdsRef.current.has(e.eventId!));
                brandNew.forEach((e) => processedEventIdsRef.current.add(e.eventId!));
                const now = Date.now();
                const staggerMs = brandNew.length > 50 ? 30 : brandNew.length > 20 ? Math.max(50, Math.min(200, 1500 / brandNew.length)) : 250;
                const staggered = brandNew.map((entry, i) => ({ ...entry, id: ++feedIdCounter, arrivedAt: now + i * staggerMs }));
                const merged = [...prev.feed, ...staggered].slice(-150);

                const apiResultCredits = status.result?.credits || 0;
                const actualCredits = Math.min(Math.max(totalCreditsFromLogs, apiResultCredits, prev.creditsEarned), prev.totalCreditsRequested);

                const drainMs = Math.min(staggered.length * 250, 3000) + 500;
                setTimeout(() => {
                  setGen((p) => ({
                    ...p,
                    state: "completed",
                    result: status.result || null,
                    creditsEarned: Math.min(Math.max(apiResultCredits, totalCreditsFromLogs, p.creditsEarned), p.totalCreditsRequested),
                  }));
                }, drainMs);

                return { ...prev, state: "running", workspaceName: status.workspaceName || prev.workspaceName, masterEmail: status.masterEmail || prev.masterEmail, creditsEarned: actualCredits, feed: merged };
              });
              return;
            }

            if (status.status === "error" || status.status === "expired" || status.status === "cancelled") {
              pollingRef.current = null;
              completedRef.current = true;
              const upstreamMsg = (status as any).error || (status as any).message || (status.result as any)?.message;
              setGen((prev) => {
                const errorMsg = status.status === "error"
                  ? (upstreamMsg ? `Erro: ${upstreamMsg}` : "Erro na geração — o provedor não conseguiu alocar bots. Tente novamente.")
                  : prev.errorMessage;
                return { ...prev, state: status.status as FarmState, errorMessage: errorMsg };
              });
              return;
            }

            if (status.status === "queued") {
              setGen((prev) => ({ ...prev, state: "queued", queuePosition: (status as any).queuePosition || prev.queuePosition }));
              schedulePoll();
              return;
            }

            if (status.status === "dequeued" && (status as any).newFarmId) {
              const newFarmId = (status as any).newFarmId;
              console.log(`[polling] Dequeued! Switching farmId to ${newFarmId}`);
              pollingRef.current = null;
              const expiresAt = Date.now() + 10 * 60 * 1000;
              setGen((prev) => ({ ...prev, state: "waiting_invite", farmId: newFarmId, masterEmail: (status as any).masterEmail || prev.masterEmail, queuePosition: null, expiresAt }));
              startExpirationTimerRef.current?.(expiresAt);
              startPollingRef.current?.(newFarmId);
              return;
            }

            if (status.status === "waiting_invite" || status.status === "allocating") {
              setGen((prev) => ({ ...prev, state: status.status as FarmState, masterEmail: status.masterEmail || prev.masterEmail }));
              schedulePoll();
              return;
            }

            if (status.status === "running" || status.status === "workspace_detected") {
              let totalCreditsFromLogs = 0;
              const incomingEntries: FeedEntry[] = [];
              if (status.logs && status.logs.length > 0) {
                for (const log of status.logs) {
                  const eid = (log as any).eventId || `${log.message}|${log.timestamp}`;
                  const entry = parseLogToFeedEntry(log.message, log.type, log.timestamp, eid);
                  incomingEntries.push(entry);
                  if (entry.kind === "credit" && entry.credits) totalCreditsFromLogs += entry.credits;
                }
              }

              setGen((prev) => {
                const brandNew = incomingEntries.filter((e) => !processedEventIdsRef.current.has(e.eventId!));
                brandNew.forEach((e) => processedEventIdsRef.current.add(e.eventId!));
                const now = Date.now();
                const staggerMs = brandNew.length > 50 ? 30 : brandNew.length > 20 ? Math.max(50, Math.min(200, 1500 / brandNew.length)) : 250;
                const staggered = brandNew.map((entry, i) => ({ ...entry, id: ++feedIdCounter, arrivedAt: now + i * staggerMs }));
                const merged = [...prev.feed, ...staggered].slice(-150);
                const apiEarned = status.result?.credits || 0;
                const bestCredits = Math.min(Math.max(totalCreditsFromLogs, apiEarned, prev.creditsEarned), prev.totalCreditsRequested);
                return { ...prev, state: "running", workspaceName: status.workspaceName || prev.workspaceName, masterEmail: status.masterEmail || prev.masterEmail, creditsEarned: bestCredits, feed: merged };
              });
            }

            // Schedule next poll
            schedulePoll();
          } catch (err) {
            // If aborted (new generation started), silently stop
            if (err instanceof DOMException && err.name === "AbortError") return;
            if (controller.signal.aborted) return;

            if (err instanceof Error && err.message === "SESSION_LOST") {
              consecutive404Ref.current += 1;
              console.warn(`[polling] 404 received (${consecutive404Ref.current}/${MAX_404_RETRIES})`);
              if (consecutive404Ref.current < MAX_404_RETRIES) {
                schedulePoll();
                return;
              }
              cleanup();
              completedRef.current = true;
              setGen((prev) => {
                if (prev.creditsEarned > 0 && prev.creditsEarned >= prev.totalCreditsRequested) {
                  return { ...prev, state: "completed" as const, result: { success: true, credits: prev.creditsEarned, attempted: prev.totalCreditsRequested, claimSuccess: Math.floor(prev.creditsEarned / 5), claimFailed: 0, inviteFailed: 0, failed: prev.totalCreditsRequested - prev.creditsEarned, removed: 0, message: "Geração concluída" } };
                }
                return { ...prev, state: "error", errorMessage: "Sessão perdida. Por favor, tente novamente." };
              });
            } else {
              // Other errors — keep polling
              schedulePoll();
            }
          }
        }, getInterval());
      };

      schedulePoll();
    },
    [cleanup]
  );

  // Keep ref updated
  useEffect(() => { startPollingRef.current = startPolling; }, [startPolling]);

  const startGeneration = useCallback(
    async (credits: number) => {
      cleanup();
      feedIdCounter = 0;
      processedEventIdsRef.current.clear();
      consecutive404Ref.current = 0;
      completedRef.current = false;
      setGen({
        state: "creating",
        farmId: null,
        masterEmail: null,
        queuePosition: null,
        workspaceName: null,
        creditsEarned: 0,
        totalCreditsRequested: credits,
        result: null,
        errorMessage: null,
        logs: [],
        feed: [],
        expiresAt: null,
      });

      try {
        const response = await createFarm(credits);

        if (response.queued) {
          setGen((prev) => ({
            ...prev,
            state: "queued",
            farmId: response.farmId,
            queuePosition: response.queuePosition || null,
          }));
          startPolling(response.farmId);
        } else {
          const expiresAt = Date.now() + 10 * 60 * 1000;
          setGen((prev) => ({
            ...prev,
            state: "waiting_invite",
            farmId: response.farmId,
            masterEmail: response.masterEmail || null,
            expiresAt,
          }));
          startExpirationTimer(expiresAt);
          startPolling(response.farmId);
        }
      } catch (err) {
        setGen((prev) => ({
          ...prev,
          state: "error",
          errorMessage: err instanceof Error ? err.message : "Erro desconhecido",
        }));
      }
    },
    [cleanup, startPolling, startExpirationTimer]
  );

  const startGenerationWithFarmId = useCallback(
    (farmId: string, credits: number, queued = false, queuePosition?: number, masterEmail?: string) => {
      cleanup();
      feedIdCounter = 0;
      processedEventIdsRef.current.clear();
      consecutive404Ref.current = 0;
      completedRef.current = false;

      if (queued) {
        setGen({
          state: "queued",
          farmId,
          masterEmail: null,
          queuePosition: queuePosition || null,
          workspaceName: null,
          creditsEarned: 0,
          totalCreditsRequested: credits,
          result: null,
          errorMessage: null,
          logs: [],
          feed: [],
          expiresAt: null,
        });
        startPolling(farmId);
      } else {
        const expiresAt = Date.now() + 10 * 60 * 1000;
        setGen({
          state: "waiting_invite",
          farmId,
          masterEmail: masterEmail || null,
          queuePosition: null,
          workspaceName: null,
          creditsEarned: 0,
          totalCreditsRequested: credits,
          result: null,
          errorMessage: null,
          logs: [],
          feed: [],
          expiresAt,
        });
        startExpirationTimer(expiresAt);
        startPolling(farmId);
      }
    },
    [cleanup, startPolling, startExpirationTimer]
  );

  const setError = useCallback((message: string) => {
    setGen((prev) => ({ ...prev, state: "error", errorMessage: message }));
  }, []);

  const cancelGeneration = useCallback(async () => {
    if (!gen.farmId) return;
    try {
      await cancelFarm(gen.farmId, accessToken);
      cleanup();
      completedRef.current = true;
      setGen((prev) => ({ ...prev, state: "cancelled" }));
    } catch {
      // Ignore cancel errors
    }
  }, [gen.farmId, cleanup]);

  const reset = useCallback(() => {
    cleanup();
    feedIdCounter = 0;
    processedEventIdsRef.current.clear();
    consecutive404Ref.current = 0;
    completedRef.current = false;
    setGen({
      state: "idle",
      farmId: null,
      masterEmail: null,
      queuePosition: null,
      workspaceName: null,
      creditsEarned: 0,
      totalCreditsRequested: 0,
      result: null,
      errorMessage: null,
      logs: [],
      feed: [],
      expiresAt: null,
    });
  }, [cleanup]);

  return {
    ...gen,
    startGeneration,
    startGenerationWithFarmId,
    setError,
    cancelGeneration,
    reset,
  };
}
