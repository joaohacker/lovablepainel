import { useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Zap, Loader2, Wallet } from "lucide-react";
import { calcularPreco, formatBRL, getPricePer100, FIXED_PACKAGES, creditsFromBalance } from "@/lib/pricing";
import { GenerationStatus } from "@/components/GenerationStatus";
import { DepositModal } from "./DepositModal";
import { AuthModal } from "./AuthModal";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";
import { useFarmGeneration } from "@/hooks/useFarmGeneration";
import { supabase } from "@/integrations/supabase/client";

export function PublicGenerator() {
  const { user, session } = useAuth();
  const { wallet, refetch: refetchWallet } = useWallet(user);
  const farm = useFarmGeneration();

  const [credits, setCredits] = useState(100);
  const [creditInput, setCreditInput] = useState("100");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [pendingCredits, setPendingCredits] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState<number | null>(null);

  const price = calcularPreco(credits);
  const pricePer100 = getPricePer100(credits);
  const balance = wallet?.balance ?? 0;
  const balanceCredits = creditsFromBalance(balance);
  const isIdle = farm.state === "idle";

  const handleSliderChange = (value: number[]) => {
    const rounded = Math.round(value[0] / 5) * 5;
    const clamped = Math.max(5, Math.min(10000, rounded));
    setCredits(clamped);
    setCreditInput(String(clamped));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCreditInput(e.target.value);
  };

  const handleInputBlur = () => {
    const val = parseInt(creditInput) || 5;
    const rounded = Math.round(val / 5) * 5;
    const clamped = Math.max(5, Math.min(10000, rounded));
    setCredits(clamped);
    setCreditInput(String(clamped));
  };

  const selectPackage = (pkg: typeof FIXED_PACKAGES[number]) => {
    setCredits(pkg.credits);
    setCreditInput(String(pkg.credits));
  };

  const handleGenerate = useCallback(async (creditsToGenerate?: number) => {
    const c = creditsToGenerate ?? credits;
    if (submittingRef.current) return;

    if (!user) {
      // Not logged in — open deposit so they pay first, then create account
      const cost = calcularPreco(c);
      setPendingCredits(c);
      setDepositAmount(Math.ceil(cost * 100) / 100);
      setShowDeposit(true);
      return;
    }

    const cost = calcularPreco(c);
    if (balance < cost) {
      setPendingCredits(c);
      setDepositAmount(Math.ceil((cost - balance) * 100) / 100);
      setShowDeposit(true);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("public-generate", {
        body: { credits: c },
      });

      if (error) throw new Error("Falha ao iniciar geração");

      if (data?.insufficient) {
        setPendingCredits(c);
        setDepositAmount(data.required - (data.balance || 0));
        setShowDeposit(true);
        return;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Falha ao iniciar geração");
      }

      refetchWallet();
      farm.startGenerationWithFarmId(
        data.farmId,
        c,
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
  }, [credits, user, balance, farm, refetchWallet]);

  // After auth, try to generate again
  const handleAuthSuccess = useCallback(() => {
    setShowAuth(false);
    refetchWallet();
    if (pendingCredits) {
      setTimeout(() => handleGenerate(pendingCredits), 500);
    }
  }, [pendingCredits, handleGenerate, refetchWallet]);

  const handleDepositSuccess = useCallback(() => {
    setShowDeposit(false);
    refetchWallet();
  }, [refetchWallet]);

  // Send update-status to backend for on-demand generations
  const farmStateRef = useRef(farm.state);
  if (farm.farmId && farm.state !== farmStateRef.current) {
    farmStateRef.current = farm.state;
    supabase.functions.invoke("validate-token", {
      body: {
        token: "__public__",
        action: "update-status",
        farmId: farm.farmId,
        status: farm.state,
        credits_earned: farm.creditsEarned,
        master_email: farm.masterEmail,
        workspace_name: farm.workspaceName,
        error_message: farm.errorMessage,
      },
    }).catch(() => {});
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <Card className="glass-card">
        <CardContent className="p-6 md:p-12">
              {/* Wallet display */}
              {user && (
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/50 px-4 py-3 mb-6">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    <span className="text-sm text-muted-foreground">Saldo:</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-foreground">{formatBRL(balance)}</span>
                    <span className="text-xs text-muted-foreground ml-2">≈ {balanceCredits} créditos</span>
                  </div>
                </div>
              )}


              {isIdle ? (
                <div className="space-y-8">
                  {/* Credit selector */}
                  <div className="text-center space-y-3">
                    <label className="text-base font-medium text-muted-foreground uppercase tracking-wider">
                      Quantidade de Créditos
                    </label>
                    <div className="flex items-center justify-center gap-3">
                      <Input
                        type="number"
                        value={creditInput}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                        min={5}
                        max={10000}
                        step={5}
                        className="w-44 text-center !text-5xl md:!text-6xl font-bold bg-secondary border-border h-20 md:h-24"
                      />
                    </div>
                  </div>

                  {/* Slider */}
                  <div className="px-4">
                    <Slider
                      value={[credits]}
                      onValueChange={handleSliderChange}
                      min={5}
                      max={10000}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex justify-between mt-3 text-sm text-muted-foreground">
                      <span>5</span>
                      <span>10.000</span>
                    </div>
                  </div>

                  {/* Price display */}
                  <div className="rounded-xl border border-border/50 bg-secondary/30 p-6 text-center space-y-2">
                    <p className="text-4xl md:text-5xl font-extrabold text-foreground">{formatBRL(price)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatBRL(pricePer100)} por cada 100 créditos
                    </p>
                  </div>

                  {/* Fixed packages */}
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-center">
                      Pacotes Populares
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {FIXED_PACKAGES.map((pkg) => (
                        <button
                          key={pkg.name}
                          onClick={() => selectPackage(pkg)}
                          className={`relative rounded-xl border p-4 text-center transition-all hover:border-primary/50 hover:bg-primary/5 ${
                            credits === pkg.credits
                              ? "border-primary bg-primary/10"
                              : "border-border/50 bg-secondary/20"
                          }`}
                        >
                          {pkg.discount && (
                            <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-success text-success-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                              {pkg.discount}
                            </span>
                          )}
                          <p className="text-sm font-semibold text-foreground">{pkg.credits}</p>
                          <p className="text-xs text-muted-foreground">{formatBRL(pkg.price)}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Generate button */}
                  <Button
                    onClick={() => handleGenerate()}
                    disabled={submitting || credits < 5}
                    size="lg"
                    className="w-full h-16 text-xl font-semibold gap-2"
                  >
                    {submitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Zap className="h-5 w-5" />
                    )}
                    {submitting ? "Iniciando..." : `Gerar ${credits} Créditos`}
                  </Button>

                  {/* Add balance button */}
                  {user && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => { setDepositAmount(null); setShowDeposit(true); }}
                    >
                      <Wallet className="h-4 w-4" /> Adicionar Saldo
                    </Button>
                  )}

                  {!user && (
                    <p className="text-xs text-center text-muted-foreground/60 mt-1">
                      Já tem conta?{" "}
                      <button onClick={() => setShowAuth(true)} className="text-primary/70 hover:text-primary hover:underline transition-colors">
                        Entrar
                      </button>
                    </p>
                  )}
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
                  onReset={() => { farm.reset(); refetchWallet(); }}
                />
              )}
          </CardContent>
      </Card>

      <DepositModal
        open={showDeposit}
        onClose={() => setShowDeposit(false)}
        onSuccess={handleDepositSuccess}
        suggestedAmount={depositAmount}
        pendingCredits={pendingCredits}
        onGenerateAfterDeposit={() => pendingCredits && handleGenerate(pendingCredits)}
        isLoggedIn={!!user}
      />

      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
