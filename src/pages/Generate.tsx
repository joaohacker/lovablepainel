import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { CreditSelector } from "@/components/CreditSelector";
import { GenerationStatus } from "@/components/GenerationStatus";
import { UpgradeModal } from "@/components/public/UpgradeModal";

import { useFarmGeneration } from "@/hooks/useFarmGeneration";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldX, Clock, Ban, TrendingUp } from "lucide-react";
import lovableHeart from "@/assets/lovable-heart.png";
import { WhatsAppButton } from "@/components/public/WhatsAppButton";

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
  daily_limit_reached?: boolean;
  daily_bonus?: number;
  maintenance?: { until: string; message: string } | null;
  warning_message?: string | null;
  error?: string;
}

const SESSION_KEY = "lovable_active_session";

interface SavedSession {
  farmId: string;
  credits: number;
  token: string;
}

const MaintenanceBanner = () => {
  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />
        <Clock className="relative h-16 w-16 text-amber-500" />
      </div>
      <h2 className="text-xl font-bold text-foreground">🔧 Manutenção em Andamento</h2>
      <p className="text-base text-muted-foreground">
        Estamos realizando melhorias no sistema. O painel volta a funcionar <span className="font-bold text-foreground">ainda hoje</span>.
      </p>

      <div className="rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10 px-5 py-4 w-full">
        <p className="text-base font-bold text-emerald-300 mb-1">✅ Geração por demanda disponível!</p>
        <p className="text-sm text-emerald-300/80 leading-relaxed">
          Você pode continuar gerando créditos pelo <a href="/" className="underline font-semibold text-emerald-200 hover:text-emerald-100">painel on-demand</a> enquanto a manutenção está em andamento.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-5 py-4 w-full">
        <p className="text-sm text-amber-300/90 leading-relaxed">
          ⏳ Aguarde o retorno — <span className="font-semibold text-amber-200">não é necessário enviar mensagem no WhatsApp</span> perguntando sobre a manutenção. Avisaremos assim que estiver liberado.
        </p>
      </div>
    </div>
  );
};

const Generate = () => {
  const { token } = useParams<{ token: string }>();
  const [validating, setValidating] = useState(true);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; type: "daily_limit" | "credits_per_use" }>({ open: false, type: "daily_limit" });
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

  // Send update-status to backend — throttled to avoid flooding realtime
  const lastStatusPushRef = useRef<{ state: string; credits: number; ts: number }>({ state: "", credits: 0, ts: 0 });
  useEffect(() => {
    if (!farm.farmId || !token || !validation?.token) return;
    if (farm.state === "idle") return;

    const now = Date.now();
    const last = lastStatusPushRef.current;

    // Always push on state transitions or terminal states
    const isStateChange = farm.state !== last.state;
    const isTerminal = ["completed", "error", "cancelled", "expired"].includes(farm.state);
    // Throttle credit-only updates to every 5s
    const creditChanged = farm.creditsEarned !== last.credits;
    const throttleOk = now - last.ts >= 5000;

    if (!isStateChange && !isTerminal && !(creditChanged && throttleOk)) return;

    lastStatusPushRef.current = { state: farm.state, credits: farm.creditsEarned, ts: now };

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
      if (isTerminal) {
        validateToken(true);
      }
    });
  }, [farm.state, farm.creditsEarned, farm.masterEmail, farm.workspaceName, farm.errorMessage, farm.farmId, token, validation?.token]);

  if (validating) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-background flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Validando acesso...</p>
        </div>
      </div>
    );
  }

  if (!validation?.valid || !validation.token) {
    // Special blocked image for specific tokens
    const isBlockedWithImage = validation?.error?.includes("desativado");
    
    if (isBlockedWithImage) {
      const AudioPlayer = () => {
        const audioRef = useRef<HTMLAudioElement>(null);
        useEffect(() => {
          const play = () => {
            audioRef.current?.play().catch(() => {});
            document.removeEventListener("click", play);
            document.removeEventListener("touchstart", play);
          };
          audioRef.current?.play().catch(() => {
            document.addEventListener("click", play);
            document.addEventListener("touchstart", play);
          });
          return () => {
            document.removeEventListener("click", play);
            document.removeEventListener("touchstart", play);
          };
        }, []);
        return <audio ref={audioRef} src="/audio/blocked-token.mp3" loop />;
      };

      return (
        <div className="fixed inset-0">
          <AudioPlayer />
          <img 
            src="/images/blocked-token.png" 
            alt="" 
            className="w-full h-full object-cover"
          />
        </div>
      );
    }

    const icon = validation?.error?.includes("expirado") ? (
      <Clock className="h-16 w-16 text-destructive" />
    ) : (
      <ShieldX className="h-16 w-16 text-destructive" />
    );

    return (
      <div className="min-h-screen min-h-[100dvh] bg-background flex items-center justify-center p-4">
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
  const isDailyLimitReached = validation.daily_limit_reached === true;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
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
            {tokenInfo.daily_limit != null && (
              <span className="ml-2 text-xs">
                · Limite diário: <span className="font-semibold text-foreground">{tokenInfo.daily_limit.toLocaleString()}</span>
                {validation.remaining_daily != null && (
                  <span className="text-muted-foreground"> (restam {validation.remaining_daily.toLocaleString()})</span>
                )}
              </span>
            )}
          </p>

          {/* Daily bonus banner */}
          {validation.daily_bonus && validation.daily_bonus > 0 && (
            <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-center">
              <p className="text-sm font-bold text-emerald-400">
                🎁 Bônus de hoje: +{validation.daily_bonus} créditos no limite diário!
              </p>
              <p className="text-[11px] text-emerald-300/70 mt-0.5">Válido apenas hoje</p>
            </div>
          )}


          {/* Token-specific warning message */}
          {validation.warning_message && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-left">
              <p className="text-xs text-red-300/90 leading-relaxed">{validation.warning_message}</p>
            </div>
          )}

        </div>

        <Card className="glass-card">
          <CardContent className="p-5 sm:p-6 md:p-8">
            {validation?.maintenance ? (
              <MaintenanceBanner />
            ) : isDailyLimitReached ? (
              <div className="flex flex-col items-center gap-5 py-4 text-center">
                <TrendingUp className="h-14 w-14 text-amber-500" />
                <h2 className="text-xl font-bold text-foreground">Limite Diário Atingido</h2>
                <p className="text-sm text-muted-foreground">
                  Você atingiu seu limite diário de <span className="font-bold text-foreground">{tokenInfo.daily_limit?.toLocaleString()}</span> créditos.
                </p>
                <p className="text-sm text-muted-foreground">Aumente seu limite para continuar gerando hoje!</p>
                <button
                  onClick={() => setUpgradeModal({ open: true, type: "daily_limit" })}
                  className="w-full h-14 text-lg font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                >
                  <TrendingUp className="h-5 w-5" />
                  Aumentar Limite Diário
                </button>
              </div>
            ) : isIdle ? (
              <CreditSelector
                onGenerate={handleGenerate}
                disabled={farm.state !== "idle"}
                maxCredits={tokenInfo.credits_per_use}
                dailyLimit={tokenInfo.daily_limit}
                remainingDaily={validation.remaining_daily}
                onUpgradePerUse={() => setUpgradeModal({ open: true, type: "credits_per_use" })}
                onUpgradeDaily={() => setUpgradeModal({ open: true, type: "daily_limit" })}
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

        <p className="text-center text-xs text-muted-foreground mt-4">
          🕐 Os limites diários resetam todo dia às 12:00 (horário de Brasília)
        </p>

        {/* Upgrade Modal */}
        {token && validation?.token && (
          <UpgradeModal
            open={upgradeModal.open}
            onOpenChange={(open) => setUpgradeModal((prev) => ({ ...prev, open }))}
            token={token}
            tokenString={token}
            upgradeType={upgradeModal.type}
            currentLimit={upgradeModal.type === "daily_limit" ? tokenInfo.daily_limit : tokenInfo.credits_per_use}
            onUpgradeComplete={() => validateToken()}
          />
        )}
      </div>
      {!validation?.maintenance && <WhatsAppButton />}
    </div>
  );
};

export default Generate;
