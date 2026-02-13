import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { CreditSelector } from "@/components/CreditSelector";
import { GenerationStatus } from "@/components/GenerationStatus";
import { useFarmGeneration } from "@/hooks/useFarmGeneration";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldX, Clock, Ban } from "lucide-react";
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
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const target = new Date(until).getTime();
    const update = () => {
      const diff = Math.max(0, target - Date.now());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [until]);

  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />
        <Clock className="relative h-16 w-16 text-amber-500" />
      </div>
      <h2 className="text-xl font-bold text-foreground">🔧 Manutenção em Andamento</h2>
      <p className="text-base text-muted-foreground">{message}</p>
      <div className="rounded-lg border border-border bg-muted/50 px-6 py-4 w-full">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Voltamos em</p>
        <p className="text-5xl font-bold tabular-nums font-mono text-foreground">
          {timeLeft}
        </p>
      </div>
    </div>
  );
};

const Generate = () => {
  const { token } = useParams<{ token: string }>();
  const [validating, setValidating] = useState(true);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const farm = useFarmGeneration(token);

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

  const validateToken = async (silent = false) => {
    if (!silent) setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-token", {
        body: { token, action: "validate" },
      });
      if (error) throw error;
      setValidation(data);
    } catch (err) {
      if (!silent) setValidation({ valid: false, error: "Erro ao validar token" });
    } finally {
      if (!silent) setValidating(false);
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

  // Send update-status to backend (fast path - lightweight)
  useEffect(() => {
    if (!farm.farmId || !token || !validation?.token) return;
    if (farm.state === "idle") return;

    supabase.functions.invoke("validate-token", {
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
    }).then(() => {
      if (["completed", "error", "cancelled", "expired"].includes(farm.state)) {
        validateToken(true);
      }
    });
  }, [farm.state, farm.creditsEarned, farm.masterEmail, farm.workspaceName, farm.errorMessage, farm.farmId, token, validation?.token]);

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

          {/* Update 2.0 flyer */}
          <div className="mt-4 rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 via-emerald-600/10 to-teal-500/15 px-5 py-4 text-left relative overflow-hidden">
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-emerald-500/10 blur-2xl" />
            <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-teal-500/10 blur-xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🚀</span>
                <p className="text-sm font-bold text-emerald-400">Painel 2.0 — Atualização!</p>
              </div>
              <p className="text-sm font-semibold text-emerald-300 leading-relaxed mb-1.5">
                Agora <span className="text-emerald-200 font-extrabold">3x mais rápido</span> e com muito menos erros!
              </p>
              <p className="text-xs text-emerald-300/70 leading-relaxed mb-1.5">
                O painel foi lançado há 2 dias e estamos trabalhando intensamente para melhorá-lo. Pedimos desculpas por qualquer inconveniência. 💚
              </p>
              <p className="text-xs font-semibold text-emerald-400/90 leading-relaxed">
                🎁 Limite diário de todos foi resetado como compensação pelos bugs!
              </p>
            </div>
          </div>

          {/* Workspace limit warning */}
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left">
            <p className="text-xs font-semibold text-amber-400 mb-1">⚠️ Atenção — Limite de membros</p>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              Sua workspace deve ter <span className="font-bold text-amber-300">no máximo 5 membros</span> no momento de convidar o bot. O fluxo agora remove membros extras automaticamente.
            </p>
          </div>

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
