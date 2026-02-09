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
  expiresAt: number | null;
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
    expiresAt: null,
  });

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
          const progressType = data.type === "progress" ? "info" : data.type;
          const newLogs = [...prev.logs, data.message].slice(-50);
          let newCredits = prev.creditsEarned;
          if (progressType === "credit" || data.message.startsWith("+5")) {
            newCredits += 5;
          }
          return { ...prev, logs: newLogs, creditsEarned: newCredits };
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
          return { ...prev, logs: [...prev.logs, event.message].slice(-50) };

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
          if (status.status === "waiting_invite" || status.status === "allocating") {
            setGen((prev) => ({
              ...prev,
              state: status.status as FarmState,
              masterEmail: status.masterEmail || prev.masterEmail,
            }));
          } else if (status.status !== "queued") {
            // Status changed from queued, try SSE again
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;

            // Connect SSE for real-time updates
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

          // Connect SSE
          disconnectSSE.current = connectSSE(
            response.farmId,
            handleSSEEvent,
            () => {
              if (response.farmId) startPolling(response.farmId);
            }
          );
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
      expiresAt: null,
    });
  }, [cleanup]);

  return {
    ...gen,
    startGeneration,
    cancelGeneration,
    reset,
  };
}
