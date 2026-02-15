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
  upgradeType: UpgradeType;
  currentLimit: number | null;
  onUpgradeComplete: () => void;
}

const DAILY_INCREMENT_OPTIONS = [1000, 2000, 5000, 10000, 20000, 50000];
const MAX_DAILY_LIMIT = 100000;
const PER_USE_TARGET_OPTIONS = [2000, 3000, 5000, 7000, 10000];
// Daily: tiered pricing per 1000 credits
function getDailyPrice(totalNewLimit: number, increment: number): number {
  const pricePerK = totalNewLimit >= 10000 ? 15 : totalNewLimit >= 5000 ? 10 : 8;
  return (increment / 1000) * pricePerK;
}

// Per-use: tiered pricing based on target
// Returns { price, originalPrice, discountPct }
function getPerUsePrice(target: number, current: number): { price: number; originalPrice: number; discountPct: number } {
  const increment = target - current;
  const originalPrice = (increment / 1000) * 30;

  // Fixed price for 10k target
  if (target >= 10000) {
    const fixedPrice = Math.min(180, originalPrice); // R$180 cap for 10k
    return { price: fixedPrice, originalPrice, discountPct: Math.round((1 - fixedPrice / originalPrice) * 100) };
  }

  let discountPct = 0;
  if (target >= 9000) discountPct = 20;
  else if (target >= 7000) discountPct = 15;
  else if (target >= 5000) discountPct = 10;
  else if (target >= 3000) discountPct = 5;

  const price = originalPrice * (1 - discountPct / 100);
  return { price, originalPrice, discountPct };
}

export function UpgradeModal({ open, onOpenChange, token, upgradeType, currentLimit, onUpgradeComplete }: UpgradeModalProps) {
  const [step, setStep] = useState<"select" | "pix">("select");
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
        onUpgradeComplete();
        onOpenChange(false);
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
    customPrice = getDailyPrice(customNewLimit, customIncrement);
    customOriginalPrice = customPrice;
  } else {
    const customTarget = roundedCustom;
    customIncrement = customTarget - current;
    customNewLimit = customTarget;
    customValid = customIncrement >= 1000 && customTarget <= maxPerUseTarget && customTarget > current;
    const p = getPerUsePrice(customTarget, current);
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
                    const newLimit = current + inc;
                    const price = getDailyPrice(newLimit, inc);
                    return renderOptionCard(inc, `+${inc.toLocaleString()} créditos`, `Novo limite: ${newLimit.toLocaleString()}`, inc, price, price, 0);
                  })}
              </>
            ) : (
              <>
                <div className="flex items-center justify-center">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 border border-green-500/30 px-3 py-1 text-xs font-bold text-green-400">
                    🔥 Até 20% OFF — quanto mais, mais barato
                  </span>
                </div>
                {PER_USE_TARGET_OPTIONS
                  .filter((target) => target > current)
                  .map((target) => {
                    const increment = target - current;
                    const p = getPerUsePrice(target, current);
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
      </DialogContent>
    </Dialog>
  );
}
