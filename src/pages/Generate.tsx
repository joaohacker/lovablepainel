import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { CreditSelector } from "@/components/CreditSelector";
import { GenerationStatus } from "@/components/GenerationStatus";
import { useFarmGeneration } from "@/hooks/useFarmGeneration";
import { Loader2, ShieldX, Clock, Ban, TrendingUp, Sparkles, Zap, Crown } from "lucide-react";
import { NightModeBanner } from "@/components/NightModeBanner";
import lovableHeart from "@/assets/lovable-heart.png";
import lovableHeartGradient from "@/assets/lovable-heart-gradient.png";

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

const MaintenanceBanner = ({ hideDemandInfo = false, maintenance }: { hideDemandInfo?: boolean; maintenance?: { until: string; message: string } | null }) => {
  const isNightBlock = maintenance?.message?.includes("estoque") || maintenance?.message?.includes("10h");
  if (isNightBlock) {
    return <NightModeBanner resumesAt={maintenance?.until} />;
  }

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="flex flex-col items-center gap-2">
        <Ban className="h-12 w-12 text-amber-500" />
        <h2 className="text-xl font-extrabold text-foreground">⚠️ Manutenção — Estoque Baixo</h2>
      </div>
      <div className="rounded-xl border-2 border-red-500/40 bg-red-500/10 px-5 py-4 w-full text-left">
        <p className="text-sm font-bold text-red-400 mb-2">❌ Por que o token está parado?</p>
        <p className="text-sm text-red-300/90 leading-relaxed">
          Estamos com <span className="font-bold text-red-200">problemas no farm de bots</span> que resultaram em <span className="font-bold text-red-200">estoque baixo</span>.
        </p>
      </div>
      {!hideDemandInfo && (
        <div className="rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10 px-5 py-4 w-full text-left space-y-3">
          <p className="text-sm font-bold text-emerald-300 mb-2">✅ O Painel por Demanda continua funcionando!</p>
          <a href="/" className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold px-6 py-3 text-base shadow-lg shadow-emerald-500/30 hover:shadow-emerald-400/40 transition-all duration-300">
            Usar Painel por Demanda Agora →
          </a>
        </div>
      )}
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
    // Backend removed — show invalid
    setValidation({ valid: false, error: "Backend removido" });
    setValidating(false);
  }, [token]);

  const handleGenerate = useCallback(async (_credits: number) => {
    // Backend removed
  }, []);

  if (validating) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
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

  if (!validation?.valid || !validation.token) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#0a0a0f] flex items-center justify-center p-4">
        <Card className="glass-card max-w-md w-full border-red-500/20">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <ShieldX className="h-16 w-16 text-red-400" />
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
    <div className="min-h-screen min-h-[100dvh] bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-violet-600/8 blur-[150px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-fuchsia-600/8 blur-[130px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-indigo-500/5 blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />
      </div>

      <div className="relative w-full max-w-md z-10">
        <div className="text-center mb-8">
          <div className="relative inline-flex items-center justify-center mb-5">
            <div className="absolute w-20 h-20 rounded-full bg-gradient-to-r from-violet-500/30 to-fuchsia-500/30 blur-xl animate-pulse" />
            <img src={lovableHeartGradient} alt="Lovable" className="relative h-12 w-12 drop-shadow-[0_0_20px_rgba(139,92,246,0.5)]" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent leading-tight">
            Gerador de Créditos
          </h1>
          <div className="mt-3 flex items-center justify-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/5 px-4 py-1.5">
              <Crown className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-sm font-semibold text-violet-300">{tokenInfo.client_name}</span>
            </div>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-violet-500/20 via-fuchsia-500/10 to-transparent opacity-60 blur-[1px]" />
          <Card className="relative rounded-2xl border-0 bg-[#12121a]/90 backdrop-blur-xl shadow-2xl shadow-violet-950/20 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-violet-500/60 to-transparent" />
            <CardContent className="p-5 sm:p-6 md:p-8">
              {validation?.maintenance ? (
                <MaintenanceBanner hideDemandInfo={validation?.maintenance?.hide_demand_info} maintenance={validation?.maintenance} />
              ) : isIdle ? (
                <CreditSelector
                  onGenerate={handleGenerate}
                  disabled={false}
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
      </div>
    </div>
  );
};

export default Generate;
