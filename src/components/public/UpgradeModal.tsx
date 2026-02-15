import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

const DAILY_INCREMENT_OPTIONS = [1000, 2000, 3000, 5000];
const PER_USE_TARGET_OPTIONS = [2000, 3000, 5000, 10000];
const PRICE_PER_1000_DAILY = 15;
const PRICE_PER_1000_PER_USE = 30;

export function UpgradeModal({ open, onOpenChange, token, upgradeType, currentLimit, onUpgradeComplete }: UpgradeModalProps) {
  const [step, setStep] = useState<"select" | "pix">("select");
  const [selectedIncrement, setSelectedIncrement] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pixCode, setPixCode] = useState("");
  const [amount, setAmount] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pricePerUnit = upgradeType === "daily_limit" ? PRICE_PER_1000_DAILY : PRICE_PER_1000_PER_USE;
  const label = upgradeType === "daily_limit" ? "Limite Diário" : "Limite por Vez";
  const icon = upgradeType === "daily_limit" ? <TrendingUp className="h-5 w-5" /> : <Zap className="h-5 w-5" />;

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep("select");
      setSelectedIncrement(null);
      setPixCode("");
      setOrderId(null);
      setError(null);
    }
  }, [open]);

  // Poll for payment confirmation
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
    setSelectedIncrement(increment);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            Aumentar {label}
          </DialogTitle>
          <DialogDescription>
            {currentLimit !== null && (
              <span>Limite atual: <span className="font-bold text-foreground">{currentLimit.toLocaleString()}</span> créditos</span>
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
              // Daily limit: increment options (adds to current)
              DAILY_INCREMENT_OPTIONS.map((inc) => {
                const price = (inc / 1000) * pricePerUnit;
                const newLimit = (currentLimit || 0) + inc;
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
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary">
                          R$ {price.toFixed(2).replace(".", ",")}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })
            ) : (
              // Per-use: fixed target options (replaces current, min 2000)
              PER_USE_TARGET_OPTIONS
                .filter((target) => target > (currentLimit || 0))
                .map((target) => {
                  const increment = target - (currentLimit || 0);
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
                            Atual: {(currentLimit || 0).toLocaleString()} → {target.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-primary">
                            R$ {price.toFixed(2).replace(".", ",")}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })
            )}

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
