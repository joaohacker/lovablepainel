import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PixStep } from "@/components/public/PixStep";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp, Zap, Check } from "lucide-react";

type UpgradeType = "daily_limit" | "credits_per_use";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  tokenString?: string;
  upgradeType: UpgradeType;
  currentLimit: number | null;
  onUpgradeComplete: () => void;
}

const DAILY_INCREMENT_OPTIONS = [1000, 2000, 5000, 10000, 20000, 50000];
const MAX_DAILY_LIMIT = 100000;
const PER_USE_TARGET_OPTIONS = [2000, 3000, 5000, 7000, 10000];
const DEFAULT_PRICE_PER_1000_DAILY = 7.5;
const DEFAULT_PRICE_PER_1000_PER_USE = 15;

// Token-specific pricing (must match backend)
const TOKEN_PRICING: Record<string, { dailyPer1k: number; perUsePer1k: number }> = {
  "f35112c962407939853dc9db8de84013": { dailyPer1k: 1.25, perUsePer1k: 2.5 },
};

function getDailyDiscount(credits: number): number {
  if (credits > 30000) return 25;
  if (credits >= 16000) return 20;
  if (credits >= 9000) return 15;
  if (credits >= 6000) return 10;
  if (credits >= 3000) return 5;
  return 0;
}

function getDailyPrice(increment: number, tokenStr?: string): { price: number; originalPrice: number; discountPct: number } {
  const rate = TOKEN_PRICING[tokenStr || ""]?.dailyPer1k ?? DEFAULT_PRICE_PER_1000_DAILY;
  const originalPrice = increment * (rate / 1000);
  const discountPct = getDailyDiscount(increment);
  const price = originalPrice * (1 - discountPct / 100);
  return { price, originalPrice, discountPct };
}

function getPerUseDiscount(credits: number): number {
  if (credits >= 15000) return 25;
  if (credits > 10000) return 20;
  if (credits >= 9000) return 15;
  if (credits >= 6000) return 10;
  if (credits >= 3000) return 5;
  return 0;
}

function getPerUsePrice(target: number, current: number, tokenStr?: string): { price: number; originalPrice: number; discountPct: number } {
  const increment = target - current;
  const rate = TOKEN_PRICING[tokenStr || ""]?.perUsePer1k ?? DEFAULT_PRICE_PER_1000_PER_USE;
  const originalPrice = increment * (rate / 1000);
  const discountPct = getPerUseDiscount(increment);
  const price = originalPrice * (1 - discountPct / 100);
  return { price, originalPrice, discountPct };
}

export function UpgradeModal({ open, onOpenChange, token, tokenString, upgradeType, currentLimit, onUpgradeComplete }: UpgradeModalProps) {
  const [step, setStep] = useState<"select" | "pix" | "done">("select");
  const [selectedIncrement, setSelectedIncrement] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pixCode, setPixCode] = useState("");
  const [amount, setAmount] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customValue, setCustomValue] = useState("");

  const theLabel = upgradeType === "daily_limit" ? "Limite Diário" : "Limite por Vez";
  const theIcon = upgradeType === "daily_limit" ? <TrendingUp className="h-5 w-5" /> : <Zap className="h-5 w-5" />;
  const current = currentLimit || 0;
  const maxDailyIncrement = MAX_DAILY_LIMIT - current;
  const maxPerUseTarget = 10000;

  useEffect(() => {
    if (!open) {
      setStep("select");
      setSelectedIncrement(null);
      setPixCode("");
      setOrderId(null);
      setError(null);
      setCustomValue("");
    }
  }, [open]);

  useEffect(() => {
    if (!orderId || step !== "pix") return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .single();
      if (data?.status === "paid") {
        clearInterval(interval);
        setStep("done" as any);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [orderId, step]);

  const handlePurchase = async (increment: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("upgrade-token", {
        body: { token, upgrade_type: upgradeType, increment },
      });
      if (fnError) throw fnError;
      if (!data?.success) throw new Error(data?.error || "Erro ao criar pagamento");
      setPixCode(data.pix_code);
      setAmount(data.amount);
      setOrderId(data.order_id);
      setStep("pix");
    } catch (err: any) {
      setError(err.message || "Erro ao processar upgrade");
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (p: number) => `R$ ${p.toFixed(2).replace(".", ",")}`;

  // Custom value logic
  const parsedCustom = parseInt(customValue) || 0;
  const roundedCustom = Math.round(parsedCustom / 1000) * 1000;

  let customIncrement = 0;
  let customValid = false;
  let customNewLimit = 0;
  let customPrice = 0;
  let customOriginalPrice = 0;
  let customDiscountPct = 0;

  if (upgradeType === "daily_limit") {
    customIncrement = roundedCustom;
    customNewLimit = current + customIncrement;
    customValid = customIncrement >= 1000 && customNewLimit <= MAX_DAILY_LIMIT;
    const dp = getDailyPrice(customIncrement, tokenString);
    customPrice = dp.price;
    customOriginalPrice = dp.originalPrice;
    customDiscountPct = dp.discountPct;
  } else {
    const customTarget = roundedCustom;
    customIncrement = customTarget - current;
    customNewLimit = customTarget;
    customValid = customIncrement >= 1000 && customTarget <= maxPerUseTarget && customTarget > current;
    const p = getPerUsePrice(customTarget, current, tokenString);
    customPrice = p.price;
    customOriginalPrice = p.originalPrice;
    customDiscountPct = p.discountPct;
  }

  const renderOptionCard = (key: number, title: string, subtitle: string, increment: number, price: number, originalPrice: number, discountPct: number) => {
    const isSelected = selectedIncrement === increment;
    return (
      <Card
        key={key}
        className={`cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/10" : "hover:border-primary/50"}`}
        onClick={() => setSelectedIncrement(increment)}
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
              {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
            <div>
              <p className="font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="text-right">
            {discountPct > 0 && (
              <p className="text-xs text-muted-foreground line-through">{formatPrice(originalPrice)}</p>
            )}
            <p className="text-lg font-bold text-primary">{formatPrice(price)}</p>
            {discountPct > 0 && (
              <p className="text-[10px] font-semibold text-green-400">-{discountPct}%</p>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {theIcon}
            Aumentar {theLabel}
          </DialogTitle>
          <DialogDescription>
            Limite atual: <span className="font-bold text-foreground">{current.toLocaleString()}</span> créditos
            {upgradeType === "daily_limit" && (
              <span className="text-xs"> (máx: {MAX_DAILY_LIMIT.toLocaleString()})</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-3">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {upgradeType === "daily_limit" ? (
              <>
                {DAILY_INCREMENT_OPTIONS
                  .filter((inc) => inc <= maxDailyIncrement)
                  .map((inc) => {
                    const dp = getDailyPrice(inc, tokenString);
                    const newLimit = current + inc;
                    return renderOptionCard(inc, `+${inc.toLocaleString()} créditos`, `Novo limite: ${newLimit.toLocaleString()}`, inc, dp.price, dp.originalPrice, dp.discountPct);
                  })}
              </>
            ) : (
              <>
                <div className="flex items-center justify-center">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
                    🔥 50% OFF — quanto mais, mais barato
                  </span>
                </div>
                {PER_USE_TARGET_OPTIONS
                  .filter((target) => target > current)
                  .map((target) => {
                    const increment = target - current;
                    const p = getPerUsePrice(target, current, tokenString);
                    return renderOptionCard(target, `${target.toLocaleString()} créditos/vez`, `Atual: ${current.toLocaleString()} → ${target.toLocaleString()}`, increment, p.price, p.originalPrice, p.discountPct);
                  })}
              </>
            )}

            {/* Custom value input */}
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Valor personalizado</p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder={upgradeType === "daily_limit" ? "Ex: 7000" : "Ex: 4000"}
                  value={customValue}
                  onChange={(e) => {
                    setCustomValue(e.target.value);
                    setSelectedIncrement(null);
                  }}
                  min={1000}
                  step={1000}
                  className="flex-1"
                />
              </div>
              {customValue && roundedCustom > 0 && (
                <p className="text-xs text-muted-foreground">
                  {customValid ? (
                    <>
                      {upgradeType === "daily_limit"
                        ? `+${customIncrement.toLocaleString()} → Novo limite: ${customNewLimit.toLocaleString()}`
                        : `${customNewLimit.toLocaleString()} créditos/vez (+${customIncrement.toLocaleString()})`}
                      {" · "}
                      {customDiscountPct > 0 || (upgradeType === "daily_limit") ? (
                        <>
                          <span className="line-through text-muted-foreground/60">{formatPrice(customOriginalPrice)}</span>{" "}
                        </>
                      ) : null}
                      <span className="font-semibold text-primary">{formatPrice(customPrice)}</span>
                      {customDiscountPct > 0 && <span className="text-green-400 ml-1">(-{customDiscountPct}%)</span>}
                    </>
                  ) : (
                    <span className="text-destructive">
                      {upgradeType === "daily_limit"
                        ? `Mínimo 1.000, máximo +${maxDailyIncrement.toLocaleString()}`
                        : `Mínimo ${(current + 1000).toLocaleString()}, máximo ${maxPerUseTarget.toLocaleString()}`}
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Pay button */}
            <Button
              className="w-full h-12 text-base font-semibold gap-2"
              disabled={loading || (!selectedIncrement && !customValid)}
              onClick={() => {
                if (customValue && customValid && !selectedIncrement) {
                  handlePurchase(customIncrement);
                } else if (selectedIncrement) {
                  handlePurchase(selectedIncrement);
                }
              }}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Zap className="h-5 w-5" />
              )}
              {loading ? "Gerando PIX..." : "Pagar via PIX"}
            </Button>
          </div>
        )}

        {step === "pix" && pixCode && (
          <PixStep pixCode={pixCode} amount={amount} />
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-400" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Pagamento Confirmado!</h3>
            <p className="text-sm text-muted-foreground">
              Seu {theLabel.toLowerCase()} foi aumentado com sucesso.
            </p>
            <Button
              className="w-full h-11 font-semibold"
              onClick={() => {
                onUpgradeComplete();
                onOpenChange(false);
                window.location.reload();
              }}
            >
              Atualizar Página
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
