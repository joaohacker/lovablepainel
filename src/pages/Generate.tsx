import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { CreditSelector } from "@/components/CreditSelector";
import { GenerationStatus } from "@/components/GenerationStatus";


import { useFarmGeneration } from "@/hooks/useFarmGeneration";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldX, Clock, Ban, TrendingUp, Sparkles, Zap, Crown } from "lucide-react";
import lovableHeart from "@/assets/lovable-heart.png";
import lovableHeartGradient from "@/assets/lovable-heart-gradient.png";
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
  maintenance?: { until: string; message: string; hide_demand_info?: boolean } | null;
  warning_message?: string | null;
  error?: string;
}

const SESSION_KEY = "lovable_active_session";

interface SavedSession {
  farmId: string;
  credits: number;
  token: string;
}

const MaintenanceBanner = ({ hideDemandInfo = false }: { hideDemandInfo?: boolean }) => {
  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="flex flex-col items-center gap-2">
        <Ban className="h-12 w-12 text-amber-500" />
        <h2 className="text-xl font-extrabold text-foreground">⚠️ Manutenção — Estoque Baixo</h2>
      </div>
      <div className="rounded-xl border-2 border-red-500/40 bg-red-500/10 px-5 py-4 w-full text-left">
        <p className="text-sm font-bold text-red-400 mb-2">❌ Por que o token está parado?</p>
        <p className="text-sm text-red-300/90 leading-relaxed">
          Estamos com <span className="font-bold text-red-200">problemas no farm de bots</span> que resultaram em <span className="font-bold text-red-200">estoque baixo</span>. Os tokens consomem um volume muito grande de estoque porque atendem muitos usuários ao mesmo tempo. Por isso a geração via token está <span className="font-bold text-red-200">temporariamente pausada</span> até normalizarmos o farm.
        </p>
      </div>
      {!hideDemandInfo && (
        <div className="rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10 px-5 py-4 w-full text-left space-y-3">
          <p className="text-sm font-bold text-emerald-300 mb-2">✅ O Painel por Demanda continua funcionando!</p>
          <p className="text-sm text-emerald-300/80 leading-relaxed">
            Enquanto o token está pausado, você pode usar o <span className="font-bold text-emerald-200">Painel por Demanda</span> normalmente. Ele consome <span className="font-bold text-emerald-200">muito menos estoque</span> porque atende um usuário por vez, então conseguimos manter ele ativo mesmo com estoque limitado.
          </p>
          <a
            href="/"
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold px-6 py-3 text-base shadow-lg shadow-emerald-500/30 hover:shadow-emerald-400/40 transition-all duration-300"
          >
            Usar Painel por Demanda Agora →
          </a>
        </div>
      )}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 w-full">
        <p className="text-xs text-amber-300/90 text-center leading-relaxed">
          ⏳ Aguarde o retorno — <span className="font-semibold text-amber-200">não precisa mandar mensagem no WhatsApp</span>. Avisaremos quando voltar.
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

  // Resume session after page refresh
  const hasResumedRef = useRef(false);
  useEffect(() => {
    if (!token || validating || !validation?.valid) return;
    if (hasResumedRef.current) return;
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

  const handleGenerate = useCallback(
    async (credits: number) => {
      if (!token || !validation?.token) return;
      try {
        const { data, error } = await supabase.functions.invoke("validate-token", {
          body: { token, action: "create", credits },
        });
        if (error) throw new Error("Falha ao iniciar geração");
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

  // Send update-status to backend
  const lastStatusPushRef = useRef<{ state: string; credits: number; ts: number }>({ state: "", credits: 0, ts: 0 });
  useEffect(() => {
    if (!farm.farmId || !token || !validation?.token) return;
    if (farm.state === "idle") return;
    const now = Date.now();
    const last = lastStatusPushRef.current;
    const isStateChange = farm.state !== last.state;
    const isTerminal = ["completed", "error", "cancelled", "expired"].includes(farm.state);
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

  // === LOADING STATE ===
  if (validating) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-[120px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-fuchsia-600/10 blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
        </div>
        <div className="relative flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 blur-xl opacity-40 animate-pulse" />
            <img src={lovableHeartGradient} alt="Lovable" className="relative h-16 w-16 animate-bounce" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            <p className="text-violet-300/80 font-medium">Validando acesso...</p>
          </div>
        </div>
      </div>
    );
  }

  // === BLOCKED / INVALID ===
  if (!validation?.valid || !validation.token) {
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
          <img src="/images/blocked-token.png" alt="" className="w-full h-full object-cover" />
        </div>
      );
    }

    const icon = validation?.error?.includes("expirado") ? (
      <Clock className="h-16 w-16 text-red-400" />
    ) : (
      <ShieldX className="h-16 w-16 text-red-400" />
    );

    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#0a0a0f] flex items-center justify-center p-4">
        <Card className="glass-card max-w-md w-full border-red-500/20">
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
    <div className="min-h-screen min-h-[100dvh] bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
      {/* ===== PREMIUM BACKGROUND ===== */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Main gradient orbs */}
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-violet-600/8 blur-[150px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-fuchsia-600/8 blur-[130px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-indigo-500/5 blur-[100px]" />
        
        {/* Subtle grid overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{
            backgroundImage: `linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }} 
        />

        {/* Animated floating particles */}
        <div className="absolute top-[10%] left-[15%] w-1.5 h-1.5 rounded-full bg-violet-400/40 animate-float-1" />
        <div className="absolute top-[30%] right-[20%] w-1 h-1 rounded-full bg-fuchsia-400/30 animate-float-2" />
        <div className="absolute bottom-[25%] left-[25%] w-2 h-2 rounded-full bg-indigo-400/20 animate-float-3" />
        <div className="absolute top-[60%] right-[10%] w-1.5 h-1.5 rounded-full bg-violet-300/25 animate-float-1" style={{ animationDelay: "2s" }} />
        <div className="absolute top-[80%] left-[60%] w-1 h-1 rounded-full bg-fuchsia-300/30 animate-float-2" style={{ animationDelay: "1s" }} />
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div className="relative w-full max-w-md z-10">
        {/* Header - Premium branding */}
        <div className="text-center mb-8">
          {/* Glowing logo */}
          <div className="relative inline-flex items-center justify-center mb-5">
            <div className="absolute w-20 h-20 rounded-full bg-gradient-to-r from-violet-500/30 to-fuchsia-500/30 blur-xl animate-pulse" />
            <div className="absolute w-14 h-14 rounded-full bg-gradient-to-r from-violet-400/20 to-fuchsia-400/20 blur-md" />
            <img src={lovableHeartGradient} alt="Lovable" className="relative h-12 w-12 drop-shadow-[0_0_20px_rgba(139,92,246,0.5)]" />
          </div>

          {/* Title with gradient */}
          <h1 className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent leading-tight">
            Gerador de Créditos
          </h1>
          
          {/* Subtitle with client info */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/5 px-4 py-1.5">
              <Crown className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-sm font-semibold text-violet-300">{tokenInfo.client_name}</span>
            </div>
          </div>

          {/* Stats bar */}
          {tokenInfo.daily_limit != null && (
            <div className="mt-4 inline-flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm px-5 py-2.5">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs text-white/50">Limite diário</span>
                <span className="text-sm font-bold text-white/90">{tokenInfo.daily_limit.toLocaleString()}</span>
              </div>
              {validation.remaining_daily != null && (
                <>
                  <div className="w-px h-4 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-xs text-white/50">Restam</span>
                    <span className="text-sm font-bold text-emerald-400">{validation.remaining_daily.toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Daily bonus banner */}
          {validation.daily_bonus && validation.daily_bonus > 0 && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-emerald-400/5 px-5 py-3 text-center">
              <p className="text-sm font-bold text-emerald-400">
                🎁 Bônus de hoje: +{validation.daily_bonus} créditos no limite diário!
              </p>
              <p className="text-[11px] text-emerald-300/60 mt-0.5">Válido apenas hoje</p>
            </div>
          )}

          {/* Token warning */}
          {validation.warning_message && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-3 text-left">
              <p className="text-xs text-red-300/80 leading-relaxed">{validation.warning_message}</p>
            </div>
          )}
        </div>

        {/* ===== MAIN CARD ===== */}
        <div className="relative group">
          {/* Card glow effect */}
          <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-violet-500/20 via-fuchsia-500/10 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500 blur-[1px]" />
          
          <Card className="relative rounded-2xl border-0 bg-[#12121a]/90 backdrop-blur-xl shadow-2xl shadow-violet-950/20 overflow-hidden">
            {/* Top gradient line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-violet-500/60 to-transparent" />
            
            <CardContent className="p-5 sm:p-6 md:p-8">
              {validation?.maintenance ? (
                <MaintenanceBanner hideDemandInfo={validation?.maintenance?.hide_demand_info} />
              ) : isDailyLimitReached ? (
                <div className="flex flex-col items-center gap-5 py-4 text-center">
                  <TrendingUp className="h-14 w-14 text-amber-500" />
                  <h2 className="text-xl font-bold text-foreground">Limite Diário Atingido</h2>
                  <p className="text-sm text-muted-foreground">
                    Você atingiu seu limite diário de <span className="font-bold text-foreground">{tokenInfo.daily_limit?.toLocaleString()}</span> créditos.
                  </p>
                  <p className="text-sm text-muted-foreground">Volte amanhã após o reset às 12:00 (horário de Brasília).</p>
                </div>
              ) : isIdle ? (
                <CreditSelector
                  onGenerate={handleGenerate}
                  disabled={farm.state !== "idle"}
                  maxCredits={tokenInfo.credits_per_use}
                  dailyLimit={tokenInfo.daily_limit}
                  remainingDaily={validation.remaining_daily}
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

        {/* Footer */}
        <p className="text-center text-xs text-white/30 mt-5">
          🕐 Os limites diários resetam todo dia às 12:00 (horário de Brasília)
        </p>

      </div>
      {!validation?.maintenance && <WhatsAppButton />}
    </div>
  );
};

export default Generate;
