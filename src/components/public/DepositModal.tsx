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
import { Loader2, QrCode, Wallet, CheckCircle2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/pricing";

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
  const [step, setStep] = useState<"form" | "pix" | "paid">("form");
  const [amount, setAmount] = useState(suggestedAmount ?? 7);
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [loading, setLoading] = useState(false);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("form");
      setPixCode(null);
      setOrderId(null);
      setError(null);
      if (suggestedAmount) setAmount(suggestedAmount);
    }
  }, [open, suggestedAmount]);

  const handleSubmit = async () => {
    if (!name || !document || amount < 1) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("wallet-deposit", {
        body: { amount, customer: { name, document } },
      });

      if (fnError || !data?.success) {
        throw new Error(data?.error || "Erro ao criar PIX");
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

  // Poll for payment confirmation
  useEffect(() => {
    if (step !== "pix" || !orderId) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .maybeSingle();

      if (data?.status === "paid") {
        setStep("paid");
        onSuccess();
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [step, orderId, onSuccess]);

  const handleAfterPaid = () => {
    onClose();
    if (pendingCredits) {
      setTimeout(onGenerateAfterDeposit, 500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            {step === "paid" ? "Pagamento Confirmado!" : "Adicionar Saldo"}
          </DialogTitle>
          <DialogDescription>
            {step === "form" && "Pague via PIX para adicionar saldo à sua carteira."}
            {step === "pix" && "Escaneie o QR Code ou copie o código PIX."}
            {step === "paid" && "Seu saldo foi creditado com sucesso!"}
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
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Math.max(1, parseFloat(e.target.value) || 0))}
                min={1}
                step={0.01}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
            </div>
            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              <Input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="000.000.000-00" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button onClick={handleSubmit} disabled={loading || !name || !document} className="w-full gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              Gerar PIX de {formatBRL(amount)}
            </Button>
          </div>
        )}

        {step === "pix" && pixCode && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG value={pixCode} size={200} />
            </div>
            <div className="w-full">
              <Label className="text-xs text-muted-foreground">Código PIX (Copia e Cola)</Label>
              <div className="flex gap-2 mt-1">
                <Input value={pixCode} readOnly className="text-xs" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(pixCode)}
                >
                  Copiar
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Aguardando pagamento...
            </div>
          </div>
        )}

        {step === "paid" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 className="h-16 w-16 text-success" />
            <p className="text-lg font-semibold">Saldo adicionado!</p>
            <p className="text-sm text-muted-foreground text-center">
              {formatBRL(amount)} foram creditados na sua carteira.
            </p>
            <Button onClick={handleAfterPaid} className="w-full">
              {pendingCredits ? "Iniciar Geração" : "Fechar"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
