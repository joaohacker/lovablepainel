import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, UserPlus, LogIn, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import lovableHeart from "@/assets/lovable-heart.png";

interface TokenAuthGateProps {
  token: string;
  onAuthenticated: () => void;
}

const PASSWORD_RULES = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Número", test: (p: string) => /[0-9]/.test(p) },
  { label: "Caractere especial (!@#$...)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export const TokenAuthGate = ({ token, onAuthenticated }: TokenAuthGateProps) => {
  const [mode, setMode] = useState<"login" | "signup" | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Check if already logged in and if token has an account
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Validate token — use fetch directly to avoid SDK issues
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let tokenData: any = null;
      try {
        const valRes = await fetch(`${supabaseUrl}/functions/v1/validate-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": supabaseKey },
          body: JSON.stringify({ token, action: "validate" }),
        });
        tokenData = await valRes.json();
      } catch (e) {
        console.error("[TokenAuthGate] validate error:", e);
      }

      if (!tokenData?.valid || !tokenData?.token?.id) {
        setCheckingSession(false);
        setMode("signup");
        return;
      }

      // Check if token already has a registered account
      let tokenHasAccount = false;
      try {
        const checkRes = await fetch(`${supabaseUrl}/functions/v1/token-auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": supabaseKey },
          body: JSON.stringify({ action: "check", token }),
        });
        const checkData = await checkRes.json();
        tokenHasAccount = checkData?.has_account === true;
      } catch (e) {
        console.error("[TokenAuthGate] check error:", e);
      }

      if (session) {
        // Check if this user is linked to this token
        const { data: account } = await supabase
          .from("token_accounts" as any)
          .select("token_id")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (account && (account as any).token_id === tokenData.token.id) {
          onAuthenticated();
          return;
        }
        // User logged in but not linked to this token - sign out
        await supabase.auth.signOut();
      }

      setMode(tokenHasAccount ? "login" : "signup");
      setCheckingSession(false);
    };
    checkSession();
  }, [token, onAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      // Use fetch directly to avoid supabase-js swallowing error response bodies
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/token-auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
        },
        body: JSON.stringify({
          action: mode,
          token,
          email: email.trim(),
          password,
          ...(mode === "signup" ? { username: username.trim() } : {}),
        }),
      });

      const data = await res.json();

      if (!data?.success) {
        setError(data?.error || "Erro desconhecido");
        setLoading(false);
        return;
      }

      if (mode === "signup") {
        setSuccess("Conta criada! Faça login agora.");
        setMode("login");
        setPassword("");
        setLoading(false);
        return;
      }

      // Login success - set session
      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        onAuthenticated();
      }
    } catch (err: any) {
      setError(err.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession || mode === null) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-background flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  const isSignup = mode === "signup";

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-success/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <img src={lovableHeart} alt="Lovable" className="h-10 w-10" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {isSignup ? "Criar Conta" : "Entrar"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <Lock className="inline h-3.5 w-3.5 mr-1" />
            Autenticação necessária para usar este token
          </p>
        </div>

        <Card className="glass-card">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {isSignup && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome de usuário</label>
                  <Input
                    type="text"
                    placeholder="Seu nome ou apelido"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    maxLength={50}
                    className="bg-muted/50"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email</label>
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="bg-muted/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Senha</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    className="bg-muted/50 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {isSignup && password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {PASSWORD_RULES.map((rule) => {
                      const pass = rule.test(password);
                      return (
                        <div key={rule.label} className="flex items-center gap-1.5 text-xs">
                          {pass ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-400" />
                          )}
                          <span className={pass ? "text-green-400" : "text-red-300"}>{rule.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-300">
                  {success}
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-11 font-semibold">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isSignup ? (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Criar Conta
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Entrar
                  </>
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode(isSignup ? "login" : "signup");
                  setError(null);
                  setSuccess(null);
                }}
                className="text-xs text-primary hover:underline"
              >
                {isSignup ? "Já tem conta? Faça login" : "Primeira vez? Crie sua conta"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
