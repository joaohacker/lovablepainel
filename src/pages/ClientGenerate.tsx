import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { NightModeBanner, isNightModeBRT } from "@/components/NightModeBanner";
import { GenerationStatus } from "@/components/GenerationStatus";
import { useFarmGeneration } from "@/hooks/useFarmGeneration";

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
  const [branding, setBranding] = useState<Branding>({ brand_name: null, brand_logo_url: null, brand_color: null });

  useEffect(() => {
    document.documentElement.classList.add("dark");
    if (token) {
      sessionStorage.setItem("client_token_path", `/tokenclientes/${token}`);
    }
  }, [token]);

  useEffect(() => {
    // Backend removed — show error
    setError("Backend removido");
    setValidating(false);
  }, []);

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
    // Backend removed
  }, []);

  const handleReset = () => {
    farm.reset();
  };

  if (validating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
        {(branding.brand_name || branding.brand_logo_url) && (
          <div className="flex flex-col items-center justify-center gap-3 mb-6 py-4">
            {branding.brand_logo_url && (
              <img src={`${branding.brand_logo_url}?t=${Date.now()}`} alt="Logo" className="h-20 w-20 rounded-xl object-contain" />
            )}
            {branding.brand_name && (
              <span className="text-2xl font-bold text-center" style={{ color: brandColor || undefined }}>{branding.brand_name}</span>
            )}
          </div>
        )}

        <Card className="glass-card" style={brandColor ? { borderColor: `${brandColor}30` } : {}}>
          <CardContent className="p-6 md:p-8">
            {isIdle ? (
              isNightModeBRT() ? (
                <NightModeBanner />
              ) : (
              <div className="space-y-6">
                <div className="text-center space-y-1">
                  <p className="text-sm text-muted-foreground">Créditos disponíveis</p>
                  <p className="text-3xl font-bold text-foreground">{maxCredits}</p>
                </div>

                <div className="text-center space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Quantidade para gerar</label>
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
                  <Slider value={[credits]} onValueChange={handleSliderChange} min={5} max={maxCredits} step={5} className="w-full" />
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
              )
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
