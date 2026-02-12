import { useState, useCallback, useRef, useEffect } from "react";
import {
  createFarm,
  cancelFarm,
  getFarmStatus,
  connectSSE,
  type CreateResponse,
  type FarmStatus,
  type SSEEvent,
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
    const creditMatch = message.match(/^\+(\d+)\s/);
    const amount = creditMatch ? parseInt(creditMatch[1], 10) : 5;
    const nameMatch = message.match(/\((.+?)\)/);
    const botName = nameMatch ? nameMatch[1] : "Bot";
    return { id: ++feedIdCounter, eventId, kind: "credit", botName, credits: amount, message, timestamp };
  }
  if (logType === "warning") {
    return { id: ++feedIdCounter, eventId, kind: "warning", message, timestamp };
  }
  if (logType === "success") {
    return { id: ++feedIdCounter, eventId, kind: "success", message, timestamp };
  }
  return { id: ++feedIdCounter, eventId, kind: "info", message, timestamp };
}

export function useFarmGeneration() {
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

  const disconnectSSE = useRef<(() => void) | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (disconnectSSE.current) {
      disconnectSSE.current();
      disconnectSSE.current = null;
    }
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    // Stop processing if farm already completed
    if (completedRef.current) return;

    setGen((prev) => {
      switch (event.type) {
        case "snapshot": {
          // REPLACE logs entirely from snapshot (not append)
          const snapshotData = event as SSEEvent & { logs?: Array<{ message: string; logType: string; timestamp: number; eventId?: string }> };
          const newFeed: FeedEntry[] = [];
          let snapshotCredits = 0;

          // Clear processed set and rebuild from snapshot
          processedEventIdsRef.current.clear();

          if (snapshotData.logs && snapshotData.logs.length > 0) {
            for (const log of snapshotData.logs) {
              const eid = log.eventId || `${log.message}|${log.timestamp}`;
              processedEventIdsRef.current.add(eid);

              const entry = parseLogToFeedEntry(log.message, log.logType, log.timestamp, eid);
              newFeed.push(entry);
              if (entry.kind === "credit" && entry.credits) {
                snapshotCredits += entry.credits;
              }
            }
          }

          return {
            ...prev,
            state: (event.status as FarmState) || prev.state,
            masterEmail: event.masterEmail || prev.masterEmail,
            creditsEarned: snapshotCredits,
            feed: newFeed.slice(-50),
          };
        }

        case "status": {
          const newState: Partial<FarmGenerationState> = {
            state: (event.status as FarmState) || prev.state,
          };
          if (event.workspaceName) newState.workspaceName = event.workspaceName;
          if (event.status === "running" || event.status === "workspace_detected") {
            newState.state = "running";
          }
          return { ...prev, ...newState };
        }

        case "progress": {
          const data = event as unknown as { message: string; logType?: string; eventId?: string };
          const logType = data.logType || "info";
          const eventId = data.eventId || `${data.message}|${Date.now()}`;

          // Deduplicate by eventId
          if (processedEventIdsRef.current.has(eventId)) {
            return prev;
          }
          processedEventIdsRef.current.add(eventId);

          const newLogs = [...prev.logs, data.message].slice(-50);
          const newFeed = [...prev.feed];
          let newCredits = prev.creditsEarned;

          const entry = parseLogToFeedEntry(data.message, logType, Date.now(), eventId);
          newFeed.push(entry);
          if (entry.kind === "credit" && entry.credits) {
            newCredits += entry.credits;
          }

          return { ...prev, logs: newLogs, feed: newFeed.slice(-50), creditsEarned: newCredits };
        }

        case "completed":
          // Mark as completed to stop further processing
          completedRef.current = true;
          return {
            ...prev,
            state: "completed",
            result: event.result,
            creditsEarned: event.result?.credits || prev.creditsEarned,
          };

        case "error":
          completedRef.current = true;
          return { ...prev, state: "error", errorMessage: event.error };

        case "expired":
          completedRef.current = true;
          return { ...prev, state: "expired", errorMessage: event.message };

        case "cancelled":
          completedRef.current = true;
          return { ...prev, state: "cancelled" };

        case "heartbeat":
        case "polling":
          return prev;

        default:
          return prev;
      }
    });

    // Close SSE immediately on terminal events
    if (event.type === "completed" || event.type === "error" || event.type === "expired" || event.type === "cancelled") {
      if (disconnectSSE.current) {
        disconnectSSE.current();
        disconnectSSE.current = null;
      }
    }
  }, []);

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
          const status = await getFarmStatus(farmId);
          consecutive404Ref.current = 0;

          if (status.status === "completed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            completedRef.current = true;
            if (disconnectSSE.current) { disconnectSSE.current(); disconnectSSE.current = null; }
            setGen((prev) => ({
              ...prev,
              state: "completed",
              result: status.result || null,
              creditsEarned: status.result?.credits || prev.creditsEarned,
              workspaceName: status.workspaceName || prev.workspaceName,
              masterEmail: status.masterEmail || prev.masterEmail,
            }));
            return;
          }

          if (status.status === "error" || status.status === "expired" || status.status === "cancelled") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            completedRef.current = true;
            if (disconnectSSE.current) { disconnectSSE.current(); disconnectSSE.current = null; }
            setGen((prev) => ({
              ...prev,
              state: status.status as FarmState,
              errorMessage: status.status === "error" ? "Erro na geração" : prev.errorMessage,
            }));
            return;
          }

          if (status.status === "waiting_invite" || status.status === "allocating") {
            setGen((prev) => ({
              ...prev,
              state: status.status as FarmState,
              masterEmail: status.masterEmail || prev.masterEmail,
            }));
          } else if (status.status === "running" || status.status === "workspace_detected") {
            // Process logs from polling only if not already processed
            const newFeedEntries: FeedEntry[] = [];
            let pollingCredits = 0;

            if (status.logs && status.logs.length > 0) {
              for (const log of status.logs) {
                const eid = (log as any).eventId || `${log.message}|${log.timestamp}`;
                if (processedEventIdsRef.current.has(eid)) continue;
                processedEventIdsRef.current.add(eid);

                const entry = parseLogToFeedEntry(log.message, log.type, log.timestamp, eid);
                newFeedEntries.push(entry);
                if (entry.kind === "credit" && entry.credits) {
                  pollingCredits += entry.credits;
                }
              }
            }

            if (newFeedEntries.length > 0) {
              setGen((prev) => ({
                ...prev,
                state: "running",
                workspaceName: status.workspaceName || prev.workspaceName,
                masterEmail: status.masterEmail || prev.masterEmail,
                creditsEarned: prev.creditsEarned + pollingCredits,
                feed: [...prev.feed, ...newFeedEntries].slice(-50),
              }));
            } else {
              setGen((prev) => ({
                ...prev,
                state: "running",
                workspaceName: status.workspaceName || prev.workspaceName,
                masterEmail: status.masterEmail || prev.masterEmail,
              }));
            }

            // Only open SSE if not already connected
            if (!disconnectSSE.current) {
              disconnectSSE.current = connectSSE(
                farmId,
                handleSSEEvent,
                () => { disconnectSSE.current = null; }
              );
            }
          } else if (status.status !== "queued") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;

            if (!disconnectSSE.current) {
              disconnectSSE.current = connectSSE(
                farmId,
                handleSSEEvent,
                () => startPolling(farmId)
              );
            }
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
                  state: "completed",
                  result: {
                    success: true,
                    credits: prev.creditsEarned,
                    attempted: prev.totalCreditsRequested,
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
      }, 5000);
    },
    [handleSSEEvent, cleanup]
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

          disconnectSSE.current = connectSSE(
            response.farmId,
            handleSSEEvent,
            () => { disconnectSSE.current = null; }
          );
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
    [cleanup, handleSSEEvent, startPolling]
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

        disconnectSSE.current = connectSSE(
          farmId,
          handleSSEEvent,
          () => { disconnectSSE.current = null; }
        );
        startPolling(farmId);
      }
    },
    [cleanup, handleSSEEvent, startPolling]
  );

  const setError = useCallback((message: string) => {
    setGen((prev) => ({ ...prev, state: "error", errorMessage: message }));
  }, []);

  const cancelGeneration = useCallback(async () => {
    if (!gen.farmId) return;
    try {
      await cancelFarm(gen.farmId);
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
