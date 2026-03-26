import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Users, Gift, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Referral {
  id: string;
  referred_id: string;
  commission_paid: boolean;
  commission_amount: number;
  created_at: string;
}

export function ReferralSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [loadingCode, setLoadingCode] = useState(true);

  useEffect(() => {
    if (!user) {
      setReferralCode("");
      setLoadingCode(false);
      return;
    }

    const fetchReferralCode = async () => {
      setLoadingCode(true);
      try {
        const { data } = await supabase
          .from("profiles")
          .select("referral_code")
          .eq("user_id", user.id)
          .maybeSingle();
        setReferralCode(data?.referral_code || "");
      } finally {
        setLoadingCode(false);
      }
    };

    fetchReferralCode();
  }, [user]);

  const referralLink = referralCode
    ? `https://lovablepainel.com/?ref=${referralCode}`
    : "";

  const referralDisplay = loadingCode
    ? "Gerando seu link..."
    : referralLink || "Link indisponível. Recarregue a página.";

  useEffect(() => {
    if (!user) return;
    loadReferrals();
  }, [user]);

  const loadReferrals = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("referrals")
      .select("*")
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false });
    setReferrals((data as Referral[]) || []);
    setLoading(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast({ title: "Link copiado!" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const totalCommission = referrals.reduce(
    (sum, r) => sum + (r.commission_paid ? Number(r.commission_amount) : 0),
    0
  );
  const totalReferred = referrals.length;
  const pendingReferred = referrals.filter((r) => !r.commission_paid).length;

  if (!user) return null;

  return (
    <Card className="glass-card border-primary/20">
      <CardContent className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Gift className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">Programa de Indicação</h3>
            <p className="text-xs text-muted-foreground">
              Ganhe 10% do primeiro depósito de cada amigo indicado
            </p>
          </div>
        </div>

        {/* Link */}
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={referralDisplay}
            className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground truncate"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={copyLink}
            disabled={!referralLink || loadingCode}
            className="shrink-0 gap-1.5"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copiado" : loadingCode ? "Aguarde" : "Copiar"}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-secondary/50 p-3 text-center">
            <Users className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{totalReferred}</p>
            <p className="text-[10px] text-muted-foreground">Indicados</p>
          </div>
          <div className="rounded-lg border border-border bg-secondary/50 p-3 text-center">
            <Gift className="h-4 w-4 text-amber-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{pendingReferred}</p>
            <p className="text-[10px] text-muted-foreground">Pendentes</p>
          </div>
          <div className="rounded-lg border border-border bg-secondary/50 p-3 text-center">
            <DollarSign className="h-4 w-4 text-emerald-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-emerald-400">
              R${totalCommission.toFixed(2)}
            </p>
            <p className="text-[10px] text-muted-foreground">Ganho</p>
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-lg border border-border/50 bg-secondary/30 p-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Como funciona:</span>{" "}
            Envie seu link para um amigo. Quando ele se cadastrar e fizer o primeiro depósito, 
            você recebe automaticamente 10% do valor depositado como saldo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
