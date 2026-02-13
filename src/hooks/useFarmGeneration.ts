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

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Polling-only approach (no SSE — avoids API key exposure and edge function timeouts)
  const startPolling = useCallback(
    (farmId: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current);

      pollingRef.current = setInterval(async () => {
        if (completedRef.current) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          return;
        }

        try {
          const status = await getFarmStatus(farmId, accessToken);
          consecutive404Ref.current = 0;
          console.log(`[POLLING] status=${status.status}, logs=${status.logs?.length ?? 0}`);

          // Terminal states
          if (status.status === "completed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            completedRef.current = true;

            // Process any remaining logs before marking completed
            const finalEntries: FeedEntry[] = [];
            if (status.logs && status.logs.length > 0) {
              for (const log of status.logs) {
                const eid = (log as any).eventId || `${log.message}|${log.timestamp}`;
                finalEntries.push(parseLogToFeedEntry(log.message, log.type, log.timestamp, eid));
              }
            }

            setGen((prev) => {
              const existingIds = new Set(prev.feed.map((f) => f.eventId));
              const brandNew = finalEntries.filter((e) => !existingIds.has(e.eventId));
              const now = Date.now();
              const staggered = brandNew.map((entry, i) => ({
                ...entry,
                id: ++feedIdCounter,
                arrivedAt: now + i * 350,
              }));
              const merged = [...prev.feed, ...staggered].slice(-200);

              // Delay the completed state so drip animation can play out
              const drainMs = staggered.length * 350 + 500;
              setTimeout(() => {
                setGen((p) => ({
                  ...p,
                  state: "completed",
                  result: status.result || null,
                  creditsEarned: status.result?.credits || p.creditsEarned,
                }));
              }, drainMs);

              return {
                ...prev,
                state: "running",
                workspaceName: status.workspaceName || prev.workspaceName,
                masterEmail: status.masterEmail || prev.masterEmail,
                creditsEarned: status.result?.credits || prev.creditsEarned,
                feed: merged,
              };
            });
            return;
          }

          if (status.status === "error" || status.status === "expired" || status.status === "cancelled") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            completedRef.current = true;
            setGen((prev) => ({
              ...prev,
              state: status.status as FarmState,
              errorMessage: status.status === "error" ? "Erro na geração" : prev.errorMessage,
            }));
            return;
          }

          // Waiting invite
          if (status.status === "waiting_invite" || status.status === "allocating") {
            setGen((prev) => ({
              ...prev,
              state: status.status as FarmState,
              masterEmail: status.masterEmail || prev.masterEmail,
            }));
            return;
          }

          // Running — append only NEW entries to avoid batch appearance
          if (status.status === "running" || status.status === "workspace_detected") {
            let pollingCredits = 0;
            const incomingEntries: FeedEntry[] = [];

            if (status.logs && status.logs.length > 0) {
              for (const log of status.logs) {
                const eid = (log as any).eventId || `${log.message}|${log.timestamp}`;
                const entry = parseLogToFeedEntry(log.message, log.type, log.timestamp, eid);
                incomingEntries.push(entry);
                if (entry.kind === "credit" && entry.credits) {
                  pollingCredits += entry.credits;
                }
              }
            }

            setGen((prev) => {
              // Find entries that are truly new (not in current feed)
              const existingIds = new Set(prev.feed.map((f) => f.eventId));
              const brandNew = incomingEntries.filter((e) => !existingIds.has(e.eventId));

              // Stagger new entries by assigning incremental timestamps for animation
              const now = Date.now();
              const staggered = brandNew.map((entry, i) => ({
                ...entry,
                id: ++feedIdCounter,
                arrivedAt: now + i * 350, // 350ms apart for smooth drip effect
              }));

              const merged = [...prev.feed, ...staggered].slice(-200);

              return {
                ...prev,
                state: "running",
                workspaceName: status.workspaceName || prev.workspaceName,
                masterEmail: status.masterEmail || prev.masterEmail,
                creditsEarned: pollingCredits,
                feed: merged,
              };
            });
          }
        } catch (err) {
          if (err instanceof Error && err.message === "SESSION_LOST") {
            consecutive404Ref.current += 1;
            console.warn(`[polling] 404 received (${consecutive404Ref.current}/${MAX_404_RETRIES})`);

            if (consecutive404Ref.current < MAX_404_RETRIES) return;

            cleanup();
            completedRef.current = true;
            setGen((prev) => {
              if (prev.creditsEarned > 0 && prev.creditsEarned >= prev.totalCreditsRequested) {
                return {
                  ...prev,
                  state: "completed" as const,
                  result: {
                    success: true,
                    credits: prev.creditsEarned,
                    attempted: prev.totalCreditsRequested,
                    claimSuccess: Math.floor(prev.creditsEarned / 5),
                    claimFailed: 0,
                    inviteFailed: 0,
                    failed: prev.totalCreditsRequested - prev.creditsEarned,
                    removed: 0,
                    message: "Geração concluída",
                  },
                };
              }
              return {
                ...prev,
                state: "error",
                errorMessage: "Sessão perdida. Por favor, tente novamente.",
              };
            });
          }
        }
      }, 2500);
    },
    [cleanup]
  );

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
    [cleanup, startPolling]
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
        startPolling(farmId);
      }
    },
    [cleanup, startPolling]
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
