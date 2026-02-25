import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

import { GenerationStatus } from "@/components/GenerationStatus";
import { useFarmGeneration } from "@/hooks/useFarmGeneration";
import { supabase } from "@/integrations/supabase/client";

interface TokenInfo {
  total_credits: number;
  credits_used: number;
  remaining: number;
}

interface Branding {
  brand_name: string | null;
  brand_logo_url: string | null;
  brand_color: string | null;
}

const ClientGenerate = () => {
  const { token } = useParams<{ token: string }>();
  const farm = useFarmGeneration();

  const [validating, setValidating] = useState(true);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState(100);
  const [creditInput, setCreditInput] = useState("100");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const activeFarmIdRef = useRef<string | null>(null);
  const lastPushedEarnedRef = useRef(0);
  const lastPushedStatusRef = useRef("");
  const [branding, setBranding] = useState<Branding>({ brand_name: null, brand_logo_url: null, brand_color: null });

  useEffect(() => {
    document.documentElement.classList.add("dark");
    if (token) {
      sessionStorage.setItem("client_token_path", `/tokenclientes/${token}`);
      // Fetch branding
      supabase.functions.invoke("get-branding", { body: { token } })
        .then(({ data }) => {
          if (data) setBranding({ brand_name: data.brand_name, brand_logo_url: data.brand_logo_url, brand_color: data.brand_color });
        })
        .catch(() => {});
    }
  }, [token]);

  const validateToken = useCallback(async () => {
    if (!token) return;
    setValidating(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("client-generate", {
        body: { action: "validate", token },
      });
      if (fnError) throw new Error("Falha na validação");
      if (!data?.success) throw new Error(data?.error || "Link inválido");
      setTokenInfo(data);
      const remaining = data.remaining;
      const initial = Math.min(100, remaining);
      const rounded = Math.max(5, Math.round(initial / 5) * 5);
      setCredits(rounded);
      setCreditInput(String(rounded));
      setError(null);
    } catch (err: any) {
      setError(err.message || "Link inválido");
    } finally {
      setValidating(false);
    }
  }, [token]);

  useEffect(() => {
    validateToken();
  }, [validateToken]);

  // Push status updates to backend (like on-demand panel does)
  useEffect(() => {
    const farmId = activeFarmIdRef.current;
    if (!farmId || !token) return;

    const isTerminal = ["completed", "error", "expired", "cancelled"].includes(farm.state);

    // On terminal state, trigger refund-expired to settle and refund unused credits
    if (isTerminal && lastPushedStatusRef.current !== farm.state) {
      lastPushedStatusRef.current = farm.state;
      supabase.functions.invoke("client-generate", {
        body: {
          action: "refund-expired",
          token,
          farmId,
          creditsEarned: farm.creditsEarned,
          status: farm.state,
          workspaceName: farm.workspaceName,
        },
      }).then(({ data }) => {
        // Update remaining credits in UI
        if (data?.remaining !== undefined) {
          setTokenInfo(prev => prev ? { ...prev, remaining: data.remaining, credits_used: prev.total_credits - data.remaining } : prev);
        }
      });
      return;
    }

    // Push periodic status updates while running
    if (farm.state === "running" && farm.creditsEarned !== lastPushedEarnedRef.current) {
      lastPushedEarnedRef.current = farm.creditsEarned;
      supabase.functions.invoke("client-generate", {
        body: {
          action: "update-status",
          token,
          farmId,
          creditsEarned: farm.creditsEarned,
          status: farm.state,
          workspaceName: farm.workspaceName,
        },
      });
    }
  }, [farm.state, farm.creditsEarned, farm.workspaceName, token]);

  const maxCredits = tokenInfo?.remaining ?? 0;

  const handleSliderChange = (value: number[]) => {
    const rounded = Math.round(value[0] / 5) * 5;
    const clamped = Math.max(5, Math.min(maxCredits, rounded));
    setCredits(clamped);
    setCreditInput(String(clamped));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCreditInput(e.target.value);
  };

  const handleInputBlur = () => {
    const val = parseInt(creditInput) || 5;
    const rounded = Math.round(val / 5) * 5;
    const clamped = Math.max(5, Math.min(maxCredits, rounded));
    setCredits(clamped);
    setCreditInput(String(clamped));
  };

  const handleGenerate = useCallback(async () => {
    if (submittingRef.current || !token) return;
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("client-generate", {
        body: { action: "create", token, credits },
      });

      if (fnError) throw new Error("Falha ao iniciar geração");
      if (!data?.success) throw new Error(data?.error || "Falha ao iniciar geração");

      // Track farmId for status updates
      activeFarmIdRef.current = data.farmId;
      lastPushedEarnedRef.current = 0;
      lastPushedStatusRef.current = "";

      // Update remaining
      setTokenInfo((prev) =>
        prev ? { ...prev, credits_used: prev.total_credits - data.remaining, remaining: data.remaining } : prev
      );

      farm.startGenerationWithFarmId(
        data.farmId,
        data.credits,
        data.queued,
        data.queuePosition,
        data.masterEmail
      );
    } catch (err: any) {
      farm.setError(err.message || "Erro ao iniciar geração");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [credits, token, farm]);

  const handleReset = () => {
    activeFarmIdRef.current = null;
    lastPushedEarnedRef.current = 0;
    lastPushedStatusRef.current = "";
    farm.reset();
    validateToken();
  };

  // Loading
  if (validating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error
  if (error || !tokenInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="glass-card max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <p className="text-2xl font-bold text-destructive">Link Inválido</p>
            <p className="text-muted-foreground">{error || "Este link não existe."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No credits remaining
  if (maxCredits <= 0 && farm.state === "idle") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="glass-card max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <p className="text-2xl font-bold text-foreground">Créditos Esgotados</p>
            <p className="text-muted-foreground">
              Todos os {tokenInfo.total_credits} créditos deste link já foram utilizados.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isIdle = farm.state === "idle";

  const brandColor = branding.brand_color;

  // Apply brand color as CSS custom properties
  const pageStyle: React.CSSProperties = brandColor
    ? {
        "--brand-color": brandColor,
        "--brand-color-light": `${brandColor}15`,
        "--brand-color-medium": `${brandColor}30`,
        background: `linear-gradient(180deg, ${brandColor}12 0%, hsl(var(--background)) 40%)`,
      } as React.CSSProperties
    : {};

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8" style={pageStyle}>
      <div className="w-full max-w-lg">
        {/* Branding header */}
        {(branding.brand_name || branding.brand_logo_url) && (
          <div className="flex flex-col items-center justify-center gap-3 mb-6 py-4">
            {branding.brand_logo_url && (
              <img
                src={`${branding.brand_logo_url}?t=${Date.now()}`}
                alt="Logo"
                className="h-20 w-20 rounded-xl object-contain"
              />
            )}
            {branding.brand_name && (
              <span className="text-2xl font-bold text-center" style={{ color: brandColor || undefined }}>{branding.brand_name}</span>
            )}
          </div>
        )}

        <Card className="glass-card" style={brandColor ? { borderColor: `${brandColor}30` } : {}}>
          <CardContent className="p-6 md:p-8">
            {isIdle ? (
              <div className="space-y-6">
                <div className="text-center space-y-1">
                  <p className="text-sm text-muted-foreground">Créditos disponíveis</p>
                  <p className="text-3xl font-bold text-foreground">{maxCredits}</p>
                </div>

                <div className="text-center space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Quantidade para gerar
                  </label>
                  <div className="flex items-center justify-center">
                    <Input
                      type="number"
                      value={creditInput}
                      onChange={handleInputChange}
                      onBlur={handleInputBlur}
                      min={5}
                      max={maxCredits}
                      step={5}
                      className="w-32 text-center !text-2xl font-bold bg-secondary border-border h-14 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>

                <div className="px-2">
                  <Slider
                    value={[credits]}
                    onValueChange={handleSliderChange}
                    min={5}
                    max={maxCredits}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>5</span>
                    <span>{maxCredits}</span>
                  </div>
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={submitting || credits < 5}
                  size="lg"
                  className="w-full h-14 text-lg font-semibold"
                  style={brandColor ? { backgroundColor: brandColor, borderColor: brandColor } : {}}
                >
                  {submitting && <Loader2 className="h-5 w-5 animate-spin mr-2" />}
                  {submitting ? "Iniciando..." : `Gerar ${credits} Créditos`}
                </Button>
              </div>
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
                onReset={handleReset}
              />
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default ClientGenerate;
