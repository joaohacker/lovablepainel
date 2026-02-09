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
  kind: "credit" | "info";
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

  // Track which log messages we've already processed (by message+timestamp)
  const processedLogsRef = useRef<Set<string>>(new Set());

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
    setGen((prev) => {
      switch (event.type) {
        case "snapshot":
          return {
            ...prev,
            state: (event.status as FarmState) || prev.state,
            masterEmail: event.masterEmail || prev.masterEmail,
            creditsEarned: typeof event.credits === "number" && event.credits > prev.creditsEarned ? event.credits : prev.creditsEarned,
          };

        case "status": {
          const newState: Partial<FarmGenerationState> = {
            state: (event.status as FarmState) || prev.state,
          };
          if (event.workspaceName) newState.workspaceName = event.workspaceName;
          if (event.status === "running" || event.status === "invite_detected") {
            newState.state = "running";
          }
          return { ...prev, ...newState };
        }

        case "progress": {
          const data = event as unknown as { message: string; type: string };
          const newLogs = [...prev.logs, data.message].slice(-50);
          let newCredits = prev.creditsEarned;
          const newFeed = [...prev.feed];

          // Parse credit events
          const creditMatch = data.message.match(/^\+(\d+)\s/);
          if (creditMatch && (data.type === "credit" || data.message.includes("crédito") || data.message.includes("credit"))) {
            const amount = parseInt(creditMatch[1], 10);
            newCredits += amount;
            const nameMatch = data.message.match(/\((.+)\)/);
            const botName = nameMatch ? nameMatch[1] : "Bot";
            newFeed.push({
              id: ++feedIdCounter,
              kind: "credit",
              botName,
              credits: amount,
              message: data.message,
              timestamp: Date.now(),
            });
          } else {
            // Info event
            newFeed.push({
              id: ++feedIdCounter,
              kind: "info",
              message: data.message,
              timestamp: Date.now(),
            });
          }

          return { ...prev, logs: newLogs, feed: newFeed.slice(-50), creditsEarned: newCredits };
        }

        case "completed":
          return {
            ...prev,
            state: "completed",
            result: event.result,
            creditsEarned: event.result?.credits || prev.creditsEarned,
          };

        case "error":
          return { ...prev, state: "error", errorMessage: event.error };

        case "expired":
          return { ...prev, state: "expired", errorMessage: event.message };

        case "cancelled":
          return { ...prev, state: "cancelled" };

        case "polling":
          return prev;

        case "heartbeat":
          return prev;

        default:
          return prev;
      }
    });
  }, []);

  const startPolling = useCallback(
    (farmId: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current);

      pollingRef.current = setInterval(async () => {
        try {
          const status = await getFarmStatus(farmId);
          
          if (status.status === "completed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
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
          } else if (status.status === "running" || status.status === "invite_detected") {
            // Process logs from polling response into feed
            const newFeedEntries: FeedEntry[] = [];
            let pollingCredits = 0;
            
            if (status.logs && status.logs.length > 0) {
              for (const log of status.logs) {
                const logKey = `${log.message}|${log.timestamp}`;
                if (processedLogsRef.current.has(logKey)) continue;
                processedLogsRef.current.add(logKey);
                
                const creditMatch = log.message.match(/^\+(\d+)\s/);
                if (creditMatch && (log.type === "credit" || log.message.includes("crédito") || log.message.includes("credit"))) {
                  const amount = parseInt(creditMatch[1], 10);
                  pollingCredits += amount;
                  const nameMatch = log.message.match(/\((.+)\)/);
                  const botName = nameMatch ? nameMatch[1] : "Bot";
                  newFeedEntries.push({
                    id: ++feedIdCounter,
                    kind: "credit",
                    botName,
                    credits: amount,
                    message: log.message,
                    timestamp: log.timestamp,
                  });
                } else {
                  newFeedEntries.push({
                    id: ++feedIdCounter,
                    kind: "info",
                    message: log.message,
                    timestamp: log.timestamp,
                  });
                }
              }
            }

            setGen((prev) => {
              // Calculate total credits from all processed credit logs
              const totalFromLogs = newFeedEntries
                .filter(e => e.kind === "credit")
                .reduce((sum, e) => sum + (e.credits || 0), 0);
              const newCredits = Math.max(prev.creditsEarned, prev.creditsEarned + totalFromLogs);
              
              // Merge feed, avoiding duplicates
              const mergedFeed = [...prev.feed, ...newFeedEntries].slice(-50);
              
              return {
                ...prev,
                state: "running",
                workspaceName: status.workspaceName || prev.workspaceName,
                masterEmail: status.masterEmail || prev.masterEmail,
                creditsEarned: Math.max(newCredits, status.credits > prev.creditsEarned ? status.credits : prev.creditsEarned),
                feed: mergedFeed,
              };
            });
            
            if (!disconnectSSE.current) {
              disconnectSSE.current = connectSSE(
                farmId,
                handleSSEEvent,
                () => {
                  disconnectSSE.current = null;
                }
              );
            }
          } else if (status.status !== "queued") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;

            disconnectSSE.current = connectSSE(
              farmId,
              handleSSEEvent,
              () => startPolling(farmId)
            );
          }
        } catch (err) {
          if (err instanceof Error && err.message === "SESSION_LOST") {
            cleanup();
            setGen((prev) => ({
              ...prev,
              state: "error",
              errorMessage: "Sessão perdida. Por favor, tente novamente.",
            }));
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
      processedLogsRef.current.clear();
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
      processedLogsRef.current.clear();

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
    setGen((prev) => ({
      ...prev,
      state: "error",
      errorMessage: message,
    }));
  }, []);

  const cancelGeneration = useCallback(async () => {
    if (!gen.farmId) return;
    try {
      await cancelFarm(gen.farmId);
      cleanup();
      setGen((prev) => ({ ...prev, state: "cancelled" }));
    } catch {
      // Ignore cancel errors
    }
  }, [gen.farmId, cleanup]);

  const reset = useCallback(() => {
    cleanup();
    feedIdCounter = 0;
    processedLogsRef.current.clear();
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
