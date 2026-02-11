import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { CreditSelector } from "@/components/CreditSelector";
import { GenerationStatus } from "@/components/GenerationStatus";
import { useFarmGeneration } from "@/hooks/useFarmGeneration";
import { supabase } from "@/integrations/supabase/client";
import { fetchStock } from "@/lib/farm-api";
import { Loader2, ShieldX, Clock, Ban, Bot } from "lucide-react";
import lovableHeart from "@/assets/lovable-heart.png";

interface TokenInfo {
  id: string;
  client_name: string;
  credits_per_use: number;
  total_limit: number | null;
  daily_limit: number | null;
  expires_at: string | null;
  is_active: boolean;
}

interface ValidationResult {
  valid: boolean;
  token?: TokenInfo;
  remaining_total?: number | null;
  remaining_daily?: number | null;
  cooldown_minutes?: number;
  cooldown_remaining_ms?: number;
  maintenance?: { until: string; message: string } | null;
  error?: string;
}

const SESSION_KEY = "lovable_active_session";

interface SavedSession {
  farmId: string;
  credits: number;
  token: string;
}

const MaintenanceBanner = ({ message, until }: { message: string; until: string }) => {
  const [botCount, setBotCount] = useState<number | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const stock = await fetchStock();
        setBotCount(stock.activeWithBonus ?? stock.active ?? 0);
      } catch {
        setBotCount(null);
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />
        <Bot className="relative h-16 w-16 text-amber-500" />
      </div>
      <h2 className="text-xl font-bold text-foreground">⚠️ Gerando Bots — Aguarde</h2>
      <p className="text-base text-muted-foreground">{message}</p>
      <div className="rounded-lg border border-border bg-muted/50 px-6 py-4 w-full">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Bots disponíveis agora</p>
        <p className="text-4xl font-bold tabular-nums text-foreground">
          {botCount !== null ? botCount : <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">Atualizando a cada 5 segundos</p>
    </div>
  );
};

const Generate = () => {
  const { token } = useParams<{ token: string }>();
  const [validating, setValidating] = useState(true);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const farm = useFarmGeneration();

  // Cooldown timer state (must be before early returns)
  const [cooldownMs, setCooldownMs] = useState(0);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    if (!token) return;
    validateToken();
  }, [token]);

  // Resume session after page refresh (only on initial load)
  const hasResumedRef = useRef(false);
  useEffect(() => {
    if (!token || validating || !validation?.valid) return;
    if (hasResumedRef.current) return; // Only attempt resume once
    hasResumedRef.current = true;
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return;
    try {
      const session: SavedSession = JSON.parse(saved);
      if (session.token === token && session.farmId && farm.state === "idle") {
        farm.startGenerationWithFarmId(session.farmId, session.credits);
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [token, validating, validation]);

  // Save/clear session in sessionStorage
  useEffect(() => {
    if (!token) return;
    // When farmId is null (after reset), clear session
    if (!farm.farmId) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    const isActive = ["creating", "queued", "waiting_invite", "running"].includes(farm.state);
    if (isActive) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        farmId: farm.farmId,
        credits: farm.totalCreditsRequested,
        token,
      }));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [farm.state, farm.farmId, token]);

  const validateToken = async () => {
    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-token", {
        body: { token, action: "validate" },
      });
      if (error) throw error;
      setValidation(data);
    } catch (err) {
      setValidation({ valid: false, error: "Erro ao validar token" });
    } finally {
      setValidating(false);
    }
  };

  // Wrap startGeneration to track in generations table via edge function
  const handleGenerate = useCallback(
    async (credits: number) => {
      if (!token || !validation?.token) return;

      try {
        const { data, error } = await supabase.functions.invoke("validate-token", {
          body: { token, action: "create", credits },
        });

        if (error) throw new Error("Falha ao iniciar geração");

        // If there's an existing running session, resume it instead
        if (!data?.success && data?.existingFarmId) {
          farm.startGenerationWithFarmId(data.existingFarmId, credits);
          return;
        }

        if (!data?.success) {
          throw new Error(data?.error || "Falha ao iniciar geração");
        }

        farm.startGenerationWithFarmId(
          data.farmId,
          credits,
          data.queued,
          data.queuePosition,
          data.masterEmail
        );
      } catch (err: any) {
        farm.setError(err.message || "Erro ao iniciar geração");
      }
    },
    [token, validation, farm]
  );

  // Update generation status in DB via edge function
  useEffect(() => {
    if (!farm.farmId || !token || !validation?.token) return;

    const updateGeneration = async () => {
      await supabase.functions.invoke("validate-token", {
        body: {
          token,
          action: "update-status",
          farmId: farm.farmId,
          status: farm.state,
          credits_earned: farm.creditsEarned,
          master_email: farm.masterEmail,
          workspace_name: farm.workspaceName,
          error_message: farm.errorMessage,
        },
      });

      // Re-validate token after terminal states to refresh remaining limits
      if (["completed", "error", "cancelled", "expired"].includes(farm.state)) {
        validateToken();
      }
    };

    updateGeneration();
  }, [farm.state, farm.creditsEarned, farm.masterEmail, farm.workspaceName, farm.errorMessage, farm.farmId, token]);

  // Initialize cooldown from validation response
  useEffect(() => {
    if (validation?.cooldown_remaining_ms && validation.cooldown_remaining_ms > 0) {
      setCooldownMs(validation.cooldown_remaining_ms);
    }
  }, [validation?.cooldown_remaining_ms]);

  // Start cooldown after generation completes
  useEffect(() => {
    if (farm.state === "completed" && validation?.cooldown_minutes) {
      setCooldownMs(validation.cooldown_minutes * 60 * 1000);
    }
  }, [farm.state, validation?.cooldown_minutes]);

  // Tick down the cooldown
  useEffect(() => {
    if (cooldownMs <= 0) {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
      return;
    }
    cooldownIntervalRef.current = setInterval(() => {
      setCooldownMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
          cooldownIntervalRef.current = null;
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    };
  }, [cooldownMs > 0]);

  const formatCooldown = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  if (validating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Validando acesso...</p>
        </div>
      </div>
    );
  }

  if (!validation?.valid || !validation.token) {
    const icon = validation?.error?.includes("expirado") ? (
      <Clock className="h-16 w-16 text-destructive" />
    ) : validation?.error?.includes("desativado") ? (
      <Ban className="h-16 w-16 text-destructive" />
    ) : (
      <ShieldX className="h-16 w-16 text-destructive" />
    );

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="glass-card max-w-md w-full">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            {icon}
            <h2 className="text-xl font-bold text-foreground">Acesso Negado</h2>
            <p className="text-muted-foreground">{validation?.error || "Token inválido ou expirado."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tokenInfo = validation.token;
  const isIdle = farm.state === "idle";
  const isCooldownActive = cooldownMs > 0 && isIdle;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-success/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <img src={lovableHeart} alt="Lovable" className="h-10 w-10" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Gerador de Créditos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Olá, <span className="text-foreground font-medium">{tokenInfo.client_name}</span>
          </p>

          {/* Usage info */}
          <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
            {validation.remaining_total !== null && validation.remaining_total !== undefined && (
              <span>Usos restantes: <span className="text-foreground font-medium">{validation.remaining_total}</span></span>
            )}
            {validation.remaining_daily !== null && validation.remaining_daily !== undefined && (
              <span>Hoje: <span className="text-foreground font-medium">{validation.remaining_daily}</span></span>
            )}
          </div>
        </div>

        <Card className="glass-card">
          <CardContent className="p-6 md:p-8">
            {validation?.maintenance ? (
              <MaintenanceBanner message={validation.maintenance.message} until={validation.maintenance.until} />
            ) : isCooldownActive ? (
              <div className="flex flex-col items-center gap-5 py-8 text-center">
                <div className="relative">
                  <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20" />
                  <Clock className="relative h-16 w-16 text-primary" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Cooldown Ativo</h2>
                <p className="text-sm text-muted-foreground">
                  Aguarde o tempo de espera para clicar no botão de gerar novamente.
                </p>
                <div className="rounded-lg border border-border bg-muted/50 px-8 py-4">
                  <p className="text-4xl font-bold tabular-nums text-foreground">{formatCooldown(cooldownMs)}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cooldown de {validation?.cooldown_minutes || 10} minutos entre cliques no botão
                </p>
              </div>
            ) : isIdle ? (
              <CreditSelector
                onGenerate={handleGenerate}
                disabled={farm.state !== "idle"}
                maxCredits={tokenInfo.credits_per_use}
              />
            ) : (
              <GenerationStatus
                state={farm.state}
                masterEmail={farm.masterEmail}
                queuePosition={farm.queuePosition}
                workspaceName={farm.workspaceName}
                creditsEarned={farm.creditsEarned}
                totalCreditsRequested={farm.totalCreditsRequested}
                result={farm.result}
                errorMessage={farm.errorMessage}
                logs={farm.logs}
                feed={farm.feed}
                expiresAt={farm.expiresAt}
                onCancel={farm.cancelGeneration}
                onReset={farm.reset}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Generate;
