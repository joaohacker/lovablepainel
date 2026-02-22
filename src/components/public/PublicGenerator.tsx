import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Zap, Loader2, Wallet, Link2 } from "lucide-react";
import heartGradient from "@/assets/lovable-heart-gradient.png";
import { calcularPreco, formatBRL, getPricePer100, FIXED_PACKAGES, creditsFromBalance } from "@/lib/pricing";
import { GenerationStatus } from "@/components/GenerationStatus";
import { DepositModal } from "./DepositModal";
import { AuthModal } from "./AuthModal";
import { ClientLinkManager } from "./ClientLinkManager";
import { TransactionHistory } from "./TransactionHistory";
import { TutorialFlyer } from "./TutorialFlyer";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";
import { useFarmGeneration } from "@/hooks/useFarmGeneration";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function PublicGenerator() {
  const { user, session } = useAuth();
  const { wallet, refetch: refetchWallet } = useWallet(user);
  const farm = useFarmGeneration();
  const { toast } = useToast();

  const [credits, setCredits] = useState(100);
  const [creditInput, setCreditInput] = useState("100");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [pendingCredits, setPendingCredits] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState<number | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [linksRefreshKey, setLinksRefreshKey] = useState(0);

  // When not logged in and user tries to deposit/generate, show auth first
  // After auth success, if there was a pending action, resume it

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
      // Not logged in — require auth first
      setPendingCredits(c);
      setShowAuth(true);
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

      if (data.queued && data.generationId && !data.farmId) {
        // Queued — poll check-queue until dequeued
        farm.setError(null as any); // clear any previous error
        const pollQueue = async () => {
          const poll = setInterval(async () => {
            try {
              const { data: qData } = await supabase.functions.invoke("public-generate", {
                body: { action: "check-queue", generationId: data.generationId },
              });
              if (qData?.status === "queued") {
                farm.startGenerationWithFarmId(
                  `queued-${data.generationId}`, c, true, qData.queuePosition
                );
                return; // keep polling
              }
              // Dequeued — got a real farmId
              clearInterval(poll);
              if (qData?.farmId) {
                farm.startGenerationWithFarmId(
                  qData.farmId, c, false, null, qData.masterEmail
                );
              }
            } catch {
              // ignore poll errors
            }
          }, 3000);
          // Initial state
          farm.startGenerationWithFarmId(
            `queued-${data.generationId}`, c, true, data.queuePosition
          );
        };
        pollQueue();
      } else {
        farm.startGenerationWithFarmId(
          data.farmId,
          c,
          data.queued,
          data.queuePosition,
          data.masterEmail
        );
      }
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
    // Don't auto-trigger generate here — user state takes time to propagate.
    // User can click "Gerar" again once logged in.
    setPendingCredits(null);
  }, [refetchWallet]);

  const handleDepositSuccess = useCallback(() => {
    setShowDeposit(false);
    refetchWallet();
  }, [refetchWallet]);

  // Send update-status to backend on state transitions
  const farmStateRef = useRef(farm.state);
  const refundedRef = useRef<string | null>(null);
  if (farm.farmId && farm.state !== farmStateRef.current) {
    farmStateRef.current = farm.state;

    // Auto-refund when expired without running
    if (farm.state === "expired" && farm.creditsEarned === 0 && refundedRef.current !== farm.farmId) {

      refundedRef.current = farm.farmId;
      supabase.functions.invoke("validate-token", {
        body: {
          token: "__public__",
          action: "refund-expired",
          farmId: farm.farmId,
        },
      }).then(() => refetchWallet()).catch(() => {});
    } else {
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

      // Refetch wallet on completion — backend auto-settle may have issued a partial refund
      if (farm.state === "completed") {
        setTimeout(() => refetchWallet(), 2000);
      }
    }
  }

  // Periodically push credits_earned to DB while running (so admin dashboard updates live)
  const lastPushedCreditsRef = useRef(0);
  useEffect(() => {
    if (farm.state !== "running" || !farm.farmId) {
      lastPushedCreditsRef.current = 0;
      return;
    }

    const interval = setInterval(() => {
      // Only push if credits changed since last push
      if (farm.creditsEarned > lastPushedCreditsRef.current) {
        lastPushedCreditsRef.current = farm.creditsEarned;
        supabase.functions.invoke("validate-token", {
          body: {
            token: "__public__",
            action: "update-status",
            farmId: farm.farmId,
            status: "running",
            credits_earned: farm.creditsEarned,
            workspace_name: farm.workspaceName,
          },
        }).catch(() => {});
      }
    }, 10000); // every 10 seconds

    return () => clearInterval(interval);
  }, [farm.state, farm.farmId, farm.creditsEarned, farm.workspaceName]);

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

              {/* System active */}
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 mb-6 text-center space-y-2">
                <p className="text-lg font-semibold text-foreground">✅ Painel funcionando perfeitamente</p>
                <p className="text-sm text-muted-foreground">
                  Gerações ativas novamente! Gere seus créditos agora mesmo.
                </p>
              </div>

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
                        max={20000}
                        step={5}
                        className="w-40 text-center !text-3xl md:!text-4xl font-bold bg-secondary border-border h-16 md:h-18 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-5">
                      {FIXED_PACKAGES.map((pkg) => (
                        <button
                          key={pkg.name}
                          onClick={() => selectPackage(pkg)}
                          className={`relative rounded-xl border p-3 pt-4 text-center transition-all hover:border-primary/50 hover:bg-primary/5 ${
                            credits === pkg.credits
                              ? "border-primary bg-primary/10"
                              : "border-border/50 bg-secondary/20"
                          }`}
                        >
                          {pkg.discount && (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-success text-success-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap leading-tight">
                              {pkg.discount}
                            </span>
                          )}
                          <div className="flex items-center justify-center gap-1.5">
                            <img src={heartGradient} alt="" className="h-4 w-4 shrink-0" />
                            <p className="text-sm font-semibold text-foreground">{pkg.credits.toLocaleString()}</p>
                          </div>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">{formatBRL(pkg.price)}</p>
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
                    {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                    {submitting ? "Iniciando..." : `Gerar ${credits} Créditos`}
                  </Button>

                  {/* Generate Link button */}
                  {user && (
                    <Button
                      variant="outline"
                      className="w-full gap-2 h-12"
                      disabled={creatingLink || credits < 5}
                      onClick={async () => {
                        const cost = calcularPreco(credits);
                        if (balance < cost) {
                          setPendingCredits(null);
                          setDepositAmount(Math.ceil((cost - balance) * 100) / 100);
                          setShowDeposit(true);
                          return;
                        }
                        setCreatingLink(true);
                        try {
                          const { data, error } = await supabase.functions.invoke("create-client-token", {
                            body: { credits },
                          });
                          if (error) throw new Error("Falha ao criar link");
                          if (!data?.success) throw new Error(data?.error || "Falha ao criar link");
                          const url = `https://painelcreditoslovbl.lovable.app/tokenclientes/${data.token}`;
                          const msg = `✅ Obrigado pela compra!\n\nPara receber seus créditos na Lovable, acesse o link de geração abaixo e siga o passo a passo:\n\n🔗 Link de geração: ${url}\n\n1️⃣ Abra o link e selecione a quantidade de créditos\n2️⃣ Clique em Gerar\n3️⃣ Vai aparecer o email do bot — convide ele como EDITOR na sua workspace\n   👉 Para convidar, acesse: https://lovable.dev/settings?tab=people\n4️⃣ Depois é só aguardar que os créditos serão depositados automaticamente\n\n⚠️ Importante:\n• Faça o processo em até 10 minutos (depois o bot expira)\n• Sua workspace não pode ter mais de 5 membros no momento do convite\n\nSe tiver qualquer dúvida, me chama.`;
                          navigator.clipboard.writeText(msg);
                          toast({ title: "Mensagem copiada!", description: `Link + instruções • ${credits} créditos • ${formatBRL(data.cost)}` });
                          refetchWallet();
                          setLinksRefreshKey((k) => k + 1);
                        } catch (err: any) {
                          toast({ title: "Erro", description: err.message, variant: "destructive" });
                        } finally {
                          setCreatingLink(false);
                        }
                      }}
                    >
                      {creatingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                      Gerar Link pro cliente • {credits} créditos
                    </Button>
                  )}

                  {/* Add balance button — requires login */}
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => {
                      if (!user) {
                        setShowAuth(true);
                        return;
                      }
                      setDepositAmount(null);
                      setPendingCredits(null);
                      setShowDeposit(true);
                    }}
                  >
                    <Wallet className="h-4 w-4" /> Adicionar Saldo
                  </Button>

                  {!user && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => setShowAuth(true)}
                    >
                      Já tem conta? Entrar
                    </Button>
                  )}

                  {/* Transaction History */}
                  {user && <TransactionHistory walletId={wallet?.id} />}

                  {/* My Links */}
                  <ClientLinkManager userId={user?.id} refreshKey={linksRefreshKey} />

                  {/* Tutorial Video */}
                  <TutorialFlyer videoSrc="/videos/tutorial-demanda.mp4" />
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
      />

      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
