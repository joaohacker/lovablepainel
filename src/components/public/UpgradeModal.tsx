import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PixStep } from "@/components/public/PixStep";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp, Zap } from "lucide-react";

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
const PER_USE_TARGET_OPTIONS = [2000, 3000, 5000, 10000];
const PRICE_PER_1000_DAILY = 15;
const PRICE_PER_1000_PER_USE = 30;

export function UpgradeModal({ open, onOpenChange, token, upgradeType, currentLimit, onUpgradeComplete }: UpgradeModalProps) {
  const [step, setStep] = useState<"select" | "pix">("select");
  const [loading, setLoading] = useState(false);
  const [pixCode, setPixCode] = useState("");
  const [amount, setAmount] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customValue, setCustomValue] = useState("");

  const pricePerUnit = upgradeType === "daily_limit" ? PRICE_PER_1000_DAILY : PRICE_PER_1000_PER_USE;
  const label = upgradeType === "daily_limit" ? "Limite Diário" : "Limite por Vez";
  const icon = upgradeType === "daily_limit" ? <TrendingUp className="h-5 w-5" /> : <Zap className="h-5 w-5" />;
  const current = currentLimit || 0;

  // For daily: max increment so total doesn't exceed 100k
  const maxDailyIncrement = MAX_DAILY_LIMIT - current;
  // For per-use: max target is 10k
  const maxPerUseTarget = 10000;

  useEffect(() => {
    if (!open) {
      setStep("select");
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

  // Custom value logic
  const parsedCustom = parseInt(customValue) || 0;
  const roundedCustom = Math.round(parsedCustom / 1000) * 1000;

  let customIncrement = 0;
  let customValid = false;
  let customNewLimit = 0;
  let customPrice = 0;

  if (upgradeType === "daily_limit") {
    customIncrement = roundedCustom;
    customNewLimit = current + customIncrement;
    customValid = customIncrement >= 1000 && customNewLimit <= MAX_DAILY_LIMIT;
    customPrice = (customIncrement / 1000) * pricePerUnit;
  } else {
    // Per-use: custom value is the target
    const customTarget = roundedCustom;
    customIncrement = customTarget - current;
    customNewLimit = customTarget;
    customValid = customIncrement >= 1000 && customTarget <= maxPerUseTarget && customTarget > current;
    customPrice = (customIncrement / 1000) * pricePerUnit;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            Aumentar {label}
          </DialogTitle>
          <DialogDescription>
            Limite atual: <span className="font-bold text-foreground">{current.toLocaleString()}</span> créditos
            {upgradeType === "daily_limit" && (
              <span className="text-xs"> (máx: {MAX_DAILY_LIMIT.toLocaleString()})</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-3 pt-2">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {upgradeType === "daily_limit" ? (
              DAILY_INCREMENT_OPTIONS
                .filter((inc) => inc <= maxDailyIncrement)
                .map((inc) => {
                  const price = (inc / 1000) * pricePerUnit;
                  const newLimit = current + inc;
                  return (
                    <Card
                      key={inc}
                      className="cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => !loading && handlePurchase(inc)}
                    >
                      <div className="flex items-center justify-between p-4">
                        <div>
                          <p className="font-semibold text-foreground">+{inc.toLocaleString()} créditos</p>
                          <p className="text-xs text-muted-foreground">
                            Novo limite: {newLimit.toLocaleString()}
                          </p>
                        </div>
                        <p className="text-lg font-bold text-primary">
                          R$ {price.toFixed(2).replace(".", ",")}
                        </p>
                      </div>
                    </Card>
                  );
                })
            ) : (
              PER_USE_TARGET_OPTIONS
                .filter((target) => target > current)
                .map((target) => {
                  const increment = target - current;
                  const price = (increment / 1000) * pricePerUnit;
                  return (
                    <Card
                      key={target}
                      className="cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => !loading && handlePurchase(increment)}
                    >
                      <div className="flex items-center justify-between p-4">
                        <div>
                          <p className="font-semibold text-foreground">{target.toLocaleString()} créditos/vez</p>
                          <p className="text-xs text-muted-foreground">
                            Atual: {current.toLocaleString()} → {target.toLocaleString()}
                          </p>
                        </div>
                        <p className="text-lg font-bold text-primary">
                          R$ {price.toFixed(2).replace(".", ",")}
                        </p>
                      </div>
                    </Card>
                  );
                })
            )}

            {/* Custom value input */}
            <div className="border-t border-border pt-4 mt-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Valor personalizado</p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder={upgradeType === "daily_limit" ? "Ex: 7000" : "Ex: 4000"}
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  min={1000}
                  step={1000}
                  className="flex-1"
                />
                <Button
                  disabled={!customValid || loading}
                  onClick={() => handlePurchase(customIncrement)}
                  className="shrink-0"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pagar"}
                </Button>
              </div>
              {customValue && roundedCustom > 0 && (
                <p className="text-xs text-muted-foreground">
                  {customValid ? (
                    <>
                      {upgradeType === "daily_limit"
                        ? `+${customIncrement.toLocaleString()} → Novo limite: ${customNewLimit.toLocaleString()}`
                        : `${customNewLimit.toLocaleString()} créditos/vez (+${customIncrement.toLocaleString()})`}
                      {" · "}
                      <span className="font-semibold text-primary">
                        R$ {customPrice.toFixed(2).replace(".", ",")}
                      </span>
                    </>
                  ) : (
                    <span className="text-destructive">
                      {upgradeType === "daily_limit"
                        ? `Mínimo 1.000, máximo +${maxDailyIncrement.toLocaleString()} (total não ultrapassa ${MAX_DAILY_LIMIT.toLocaleString()})`
                        : `Mínimo ${(current + 1000).toLocaleString()}, máximo ${maxPerUseTarget.toLocaleString()}`}
                    </span>
                  )}
                </p>
              )}
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando PIX...
              </div>
            )}
          </div>
        )}

        {step === "pix" && pixCode && (
          <PixStep pixCode={pixCode} amount={amount} />
        )}
      </DialogContent>
    </Dialog>
  );
}
