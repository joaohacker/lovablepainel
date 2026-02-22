import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, QrCode, Wallet, CheckCircle2, Tag, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/pricing";
import { PixStep } from "./PixStep";

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  suggestedAmount: number | null;
  pendingCredits: number | null;
  onGenerateAfterDeposit: () => void;
}

export function DepositModal({
  open,
  onClose,
  onSuccess,
  suggestedAmount,
  pendingCredits,
  onGenerateAfterDeposit,
}: DepositModalProps) {
  // Steps: form → pix → done (user is always logged in)
  const [step, setStep] = useState<"form" | "pix" | "done">("form");
  const [amount, setAmount] = useState(suggestedAmount && suggestedAmount >= 5 ? suggestedAmount : 5);
  const [amountInput, setAmountInput] = useState(String(suggestedAmount && suggestedAmount >= 5 ? suggestedAmount : 5));
  const [loading, setLoading] = useState(false);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [showCoupon, setShowCoupon] = useState(false);
  const [couponApplied, setCouponApplied] = useState<{ discount: number; description: string } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("form");
      setPixCode(null);
      setOrderId(null);
      setError(null);
      setCouponCode("");
      setShowCoupon(false);
      setCouponApplied(null);
      setCouponError(null);
      setCouponLoading(false);
      const val = suggestedAmount && suggestedAmount >= 5 ? suggestedAmount : 5;
      setAmount(val);
      setAmountInput(String(val));
    }
  }, [open, suggestedAmount]);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError(null);
    setCouponApplied(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("validate-coupon", {
        body: { code: couponCode.trim(), amount },
      });
      if (fnError) throw new Error("Erro ao validar cupom");
      if (!data?.valid) {
        setCouponError(data?.error || "Cupom inválido");
      } else {
        setCouponApplied({ discount: data.discount, description: data.description });
      }
    } catch (err: any) {
      setCouponError(err.message || "Erro ao validar cupom");
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setCouponApplied(null);
    setCouponCode("");
    setCouponError(null);
  };

  const handleSubmit = async () => {
    if (amount < 5) return;
    setLoading(true);
    setError(null);

    try {
      const source = sessionStorage.getItem("traffic_source") || "direto";
      const { data, error: fnError } = await supabase.functions.invoke("wallet-deposit", {
        body: { amount, coupon_code: couponCode.trim() || undefined, source },
      });

      if (fnError || !data?.success) {
        throw new Error(data?.error || "Erro ao criar PIX");
      }

      if (!data.pix_code) {
        throw new Error("PIX não foi gerado. Tente novamente.");
      }

      setPixCode(data.pix_code);
      setOrderId(data.order_id);
      setStep("pix");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Poll for payment confirmation — user is always logged in now
  useEffect(() => {
    if (step !== "pix" || !orderId) return;

    const interval = setInterval(async () => {
      const { data } = await supabase.functions.invoke("check-order-status", {
        body: { order_id: orderId },
      });

      if (data?.status === "paid") {
        clearInterval(interval);
        // Try claim-deposit in case webhook didn't credit yet
        try {
          await supabase.functions.invoke("claim-deposit", {
            body: { order_id: orderId },
          });
        } catch {
          // Ignore — webhook already handled it
        }
        setStep("done");
        onSuccess();
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [step, orderId, onSuccess]);

  const handleDone = () => {
    onClose();
    if (pendingCredits) {
      setTimeout(onGenerateAfterDeposit, 500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={() => onClose()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "done" ? (
              <><CheckCircle2 className="h-5 w-5 text-success" /> Saldo Adicionado!</>
            ) : (
              <><Wallet className="h-5 w-5" /> Adicionar Saldo</>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === "form" && "Pague via PIX para adicionar saldo."}
            {step === "pix" && "Escaneie o QR Code ou copie o código PIX."}
            {step === "done" && "Seu saldo foi creditado com sucesso!"}
          </DialogDescription>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4">
            {suggestedAmount && pendingCredits && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                <p className="text-amber-300 font-semibold">💡 Saldo insuficiente</p>
                <p className="text-xs text-amber-300/80 mt-1">
                  Você precisa de mais {formatBRL(suggestedAmount)} para gerar {pendingCredits} créditos.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Valor (R$) — mínimo R$ 5,00</Label>
              <Input
                type="number"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                onBlur={() => {
                  const v = Math.max(5, parseFloat(amountInput) || 5);
                  setAmount(v);
                  setAmountInput(String(v));
                }}
                min={5}
                step={0.01}
              />
            </div>

            {/* Coupon */}
            {!showCoupon && !couponApplied ? (
              <button
                type="button"
                onClick={() => setShowCoupon(true)}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Tag className="h-3.5 w-3.5" />
                Tenho um cupom de desconto
              </button>
            ) : couponApplied ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-300">{couponApplied.description}</p>
                    <p className="text-[10px] text-emerald-300/60">Cupom: {couponCode}</p>
                  </div>
                </div>
                <button onClick={removeCoupon} className="text-emerald-300/60 hover:text-red-400 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Cupom de desconto</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null); }}
                    placeholder="CODIGO DO CUPOM"
                    className="uppercase flex-1"
                    disabled={couponLoading}
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={applyCoupon} 
                    disabled={couponLoading || !couponCode.trim()}
                    className="shrink-0"
                  >
                    {couponLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Aplicar"}
                  </Button>
                </div>
                {couponError && <p className="text-xs text-destructive">{couponError}</p>}
              </div>
            )}

            {/* Discount summary */}
            {couponApplied && (
              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatBRL(amount)}</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-400">
                  <span>Desconto</span>
                  <span>-{formatBRL(couponApplied.discount)}</span>
                </div>
                <div className="border-t border-white/10 pt-1 flex justify-between text-sm font-bold text-foreground">
                  <span>Total PIX</span>
                  <span>{formatBRL(amount - couponApplied.discount)}</span>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button onClick={handleSubmit} disabled={loading || amount < 5} className="w-full gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              Gerar PIX de {formatBRL(couponApplied ? amount - couponApplied.discount : amount)}
            </Button>
          </div>
        )}

        {step === "pix" && pixCode ? (
          <PixStep
            pixCode={pixCode}
            amount={couponApplied ? amount - couponApplied.discount : amount}
          />
        ) : step === "pix" && !pixCode ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-sm text-destructive">Erro ao gerar o PIX. Tente novamente.</p>
            <Button onClick={() => setStep("form")} variant="outline">Voltar</Button>
          </div>
        ) : null}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 className="h-16 w-16 text-success" />
            <p className="text-lg font-semibold">Saldo adicionado!</p>
            <p className="text-sm text-muted-foreground text-center">
              {formatBRL(amount)} foram creditados na sua carteira.
            </p>
            <Button onClick={handleDone} className="w-full">
              {pendingCredits ? "Iniciar Geração" : "Fechar"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}