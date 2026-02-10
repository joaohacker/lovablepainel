import { useEffect, useState, useCallback } from "react";
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
  error?: string;
}

const SESSION_KEY = "lovable_active_session";

interface SavedSession {
  farmId: string;
  credits: number;
  token: string;
}

const Generate = () => {
  const { token } = useParams<{ token: string }>();
  const [validating, setValidating] = useState(true);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const farm = useFarmGeneration();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    if (!token) return;
    validateToken();
  }, [token]);

  // Resume session after page refresh
  useEffect(() => {
    if (!token || validating || !validation?.valid) return;
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
    if (!token || !farm.farmId) return;
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
            {isIdle ? (
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
