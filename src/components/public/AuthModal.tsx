import { useState } from "react";
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
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupDone, setSignupDone] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onSuccess();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setSignupDone(true);
      }
    } catch (err: any) {
      setError(err.message || "Erro na autenticação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "login" ? "Entrar" : "Criar Conta"}</DialogTitle>
          <DialogDescription>
            {mode === "login"
              ? "Faça login para acessar seu saldo e gerar créditos."
              : "Crie sua conta para começar a gerar créditos."}
          </DialogDescription>
        </DialogHeader>

        {signupDone ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-sm text-success font-semibold">✅ Conta criada!</p>
            <p className="text-xs text-muted-foreground">
              Verifique seu email para confirmar sua conta, depois faça login.
            </p>
            <Button variant="outline" onClick={() => { setSignupDone(false); setMode("login"); }}>
              Ir para Login
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button onClick={handleSubmit} disabled={loading || !email || !password} className="w-full gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "login" ? "Entrar" : "Criar Conta"}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              {mode === "login" ? (
                <>Não tem conta? <button onClick={() => setMode("signup")} className="text-primary hover:underline">Criar conta</button></>
              ) : (
                <>Já tem conta? <button onClick={() => setMode("login")} className="text-primary hover:underline">Fazer login</button></>
              )}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
