import { useState, useEffect, useCallback } from "react";
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
import { Loader2, QrCode, Wallet, CheckCircle2, UserPlus } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
  isLoggedIn: boolean;
}

export function DepositModal({
  open,
  onClose,
  onSuccess,
  suggestedAmount,
  pendingCredits,
  onGenerateAfterDeposit,
  isLoggedIn,
}: DepositModalProps) {
  // Steps: form → pix → paid → signup (if not logged in) → done
  const [step, setStep] = useState<"form" | "pix" | "paid" | "signup" | "claiming" | "done">("form");
  const [amount, setAmount] = useState(suggestedAmount && suggestedAmount >= 5 ? suggestedAmount : 5);
  const [amountInput, setAmountInput] = useState(String(suggestedAmount && suggestedAmount >= 5 ? suggestedAmount : 5));
  const [loading, setLoading] = useState(false);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Signup fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("form");
      setPixCode(null);
      setOrderId(null);
      setError(null);
      setAuthError(null);
      setEmail("");
      setPassword("");
      setAuthMode("signup");
      const val = suggestedAmount && suggestedAmount >= 5 ? suggestedAmount : 5;
      setAmount(val);
      setAmountInput(String(val));
    }
  }, [open, suggestedAmount]);

  const handleSubmit = async () => {
    if (amount < 5) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("wallet-deposit", {
        body: { amount },
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
        clearInterval(interval);
        if (isLoggedIn) {
          // Already logged in — wallet was credited by webhook
          setStep("done");
          onSuccess();
        } else {
          // Not logged in — show signup form
          setStep("paid");
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [step, orderId, isLoggedIn, onSuccess]);

  const claimDeposit = useCallback(async () => {
    if (!orderId) return;
    setStep("claiming");
    try {
      const { data, error } = await supabase.functions.invoke("claim-deposit", {
        body: { order_id: orderId },
      });
      if (error || !data?.success) {
        throw new Error(data?.error || "Erro ao creditar saldo");
      }
      setStep("done");
      onSuccess();
    } catch (err: any) {
      setAuthError(err.message);
      setStep("signup");
    }
  }, [orderId, onSuccess]);

  const handleAuth = async () => {
    setAuthLoading(true);
    setAuthError(null);

    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      // After auth, claim the deposit
      // Small delay to ensure session is ready
      setTimeout(() => claimDeposit(), 500);
    } catch (err: any) {
      setAuthError(err.message || "Erro na autenticação");
      setAuthLoading(false);
    }
  };

  const handleDone = () => {
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
            {step === "done" ? (
              <><CheckCircle2 className="h-5 w-5 text-success" /> Saldo Adicionado!</>
            ) : step === "paid" || step === "signup" || step === "claiming" ? (
              <><UserPlus className="h-5 w-5" /> Criar Conta</>
            ) : (
              <><Wallet className="h-5 w-5" /> Adicionar Saldo</>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === "form" && "Pague via PIX para adicionar saldo."}
            {step === "pix" && "Escaneie o QR Code ou copie o código PIX."}
            {step === "paid" && "Pagamento confirmado! Crie sua conta para receber o saldo."}
            {step === "signup" && "Crie sua conta para receber o saldo."}
            {step === "claiming" && "Creditando saldo na sua conta..."}
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
            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button onClick={handleSubmit} disabled={loading || amount < 5} className="w-full gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              Gerar PIX de {formatBRL(amount)}
            </Button>
          </div>
        )}

        {step === "pix" && pixCode && (
          <PixStep
            pixCode={pixCode}
            amount={amount}
          />
        )}

        {(step === "paid" || step === "signup") && (
          <div className="space-y-4">
            <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-center">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="text-sm font-semibold text-success">Pagamento de {formatBRL(amount)} confirmado!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Crie sua conta para receber o saldo automaticamente.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>

            {authError && <p className="text-sm text-destructive">{authError}</p>}

            <Button onClick={handleAuth} disabled={authLoading || !email || !password} className="w-full gap-2">
              {authLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {authMode === "signup" ? "Criar Conta e Receber Saldo" : "Entrar e Receber Saldo"}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              {authMode === "signup" ? (
                <>Já tem conta? <button onClick={() => setAuthMode("login")} className="text-primary hover:underline">Fazer login</button></>
              ) : (
                <>Não tem conta? <button onClick={() => setAuthMode("signup")} className="text-primary hover:underline">Criar conta</button></>
              )}
            </p>
          </div>
        )}

        {step === "claiming" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Creditando saldo na sua conta...</p>
          </div>
        )}

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