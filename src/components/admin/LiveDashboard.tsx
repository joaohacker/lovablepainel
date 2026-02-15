import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, Zap, Clock, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Generation {
  id: string;
  farm_id: string;
  token_id: string | null;
  user_id: string | null;
  client_name: string;
  credits_requested: number;
  credits_earned: number;
  status: string;
  master_email: string | null;
  workspace_name: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface PaymentInfo {
  farm_id: string;
  amount: number;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  creating: { label: "Criando", variant: "secondary" },
  queued: { label: "Na Fila", variant: "outline" },
  waiting_invite: { label: "Aguardando Convite", variant: "default" },
  running: { label: "Executando", variant: "default" },
  completed: { label: "Concluído", variant: "secondary" },
  error: { label: "Erro", variant: "destructive" },
  expired: { label: "Expirado", variant: "destructive" },
  cancelled: { label: "Cancelado", variant: "secondary" },
};

export function LiveDashboard() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [payments, setPayments] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  const handleSync = async (gen: Generation) => {
    setSyncing(gen.farm_id);
    try {
      const { data: tokenData } = await supabase
        .from("tokens")
        .select("token")
        .eq("id", gen.token_id)
        .single();

      if (!tokenData) {
        toast.error("Token não encontrado para esta geração");
        return;
      }

      const { data, error } = await supabase.functions.invoke("validate-token", {
        body: { token: tokenData.token, action: "sync-status", farmId: gen.farm_id },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao sincronizar");

      toast.success(`Sincronizado: ${data.status} (${data.credits_earned} créditos)`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao sincronizar");
    } finally {
      setSyncing(null);
    }
  };

  // Fetch payment info for on-demand generations
  const fetchPayments = async (gens: Generation[]) => {
    const onDemandFarmIds = gens
      .filter((g) => g.token_id === null && g.user_id !== null)
      .map((g) => g.farm_id);

    if (onDemandFarmIds.length === 0) return;

    const { data } = await supabase
      .from("wallet_transactions")
      .select("reference_id, amount")
      .eq("type", "debit")
      .in("reference_id", onDemandFarmIds);

    if (data) {
      const map = new Map<string, number>();
      data.forEach((t) => {
        if (t.reference_id) map.set(t.reference_id, Number(t.amount));
      });
      setPayments(map);
    }
  };

  useEffect(() => {
    const fetchGenerations = async () => {
      const { data } = await supabase
        .from("generations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) {
        setGenerations(data);
        fetchPayments(data);
      }
      setLoading(false);
    };

    fetchGenerations();

    const channel = supabase
      .channel("generations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generations" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setGenerations((prev) => {
              const updated = [payload.new as Generation, ...prev].slice(0, 50);
              // Fetch payment for new on-demand generation
              const newGen = payload.new as Generation;
              if (newGen.token_id === null && newGen.user_id !== null) {
                fetchPayments([newGen]);
              }
              return updated;
            });
          } else if (payload.eventType === "UPDATE") {
            setGenerations((prev) =>
              prev.map((g) => (g.id === (payload.new as Generation).id ? (payload.new as Generation) : g))
            );
          } else if (payload.eventType === "DELETE") {
            setGenerations((prev) => prev.filter((g) => g.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Daily boundary: 12:00 BRT (15:00 UTC)
  const getDayStart = () => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(15, 0, 0, 0);
    if (now < todayStart) {
      todayStart.setDate(todayStart.getDate() - 1);
    }
    return todayStart;
  };

  const dayStart = getDayStart();

  const todayGenerations = generations.filter(
    (g) => new Date(g.created_at) >= dayStart
  );

  const activeCount = generations.filter(
    (g) => ["creating", "queued", "waiting_invite", "running"].includes(g.status)
  ).length;

  const todayCredits = todayGenerations
    .filter((g) => g.status === "completed")
    .reduce((sum, g) => sum + g.credits_earned, 0);

  const totalCredits = generations
    .filter((g) => g.status === "completed")
    .reduce((sum, g) => sum + g.credits_earned, 0);

  const todayCount = todayGenerations.length;

  const todayRevenue = todayGenerations
    .filter((g) => g.token_id === null && g.user_id !== null)
    .reduce((sum, g) => sum + (payments.get(g.farm_id) || 0), 0);

  const totalRevenue = Array.from(payments.values()).reduce((sum, v) => sum + v, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Monitoramento ao Vivo</h2>
        <p className="text-sm text-muted-foreground">Acompanhe as gerações em tempo real</p>
      </div>

      {/* Daily Stats */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">📊 Hoje</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="glass-card">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">{todayCount}</p>
                <p className="text-[11px] text-muted-foreground">Gerações hoje</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <Zap className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-xl font-bold">{todayCredits.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">Créditos hoje</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Wallet className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-xl font-bold">R$ {todayRevenue.toFixed(2)}</p>
                <p className="text-[11px] text-muted-foreground">Receita hoje</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">{activeCount}</p>
                <p className="text-[11px] text-muted-foreground">Ativas agora</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Total Stats */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">📈 Total</h3>
        <div className="grid grid-cols-3 gap-3">
          <Card className="glass-card">
            <CardContent className="p-3 flex items-center gap-3">
              <div>
                <p className="text-xl font-bold">{generations.length}</p>
                <p className="text-[11px] text-muted-foreground">Gerações</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-3 flex items-center gap-3">
              <div>
                <p className="text-xl font-bold">{totalCredits.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">Créditos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-3 flex items-center gap-3">
              <div>
                <p className="text-xl font-bold">R$ {totalRevenue.toFixed(2)}</p>
                <p className="text-[11px] text-muted-foreground">Receita on-demand</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Generations list */}
      <div className="space-y-3">
        {loading ? (
          <Card className="glass-card">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Carregando...</p>
            </CardContent>
          </Card>
        ) : generations.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Nenhuma geração registrada ainda.</p>
            </CardContent>
          </Card>
        ) : (
          generations.map((gen) => {
            const config = statusConfig[gen.status] || { label: gen.status, variant: "secondary" as const };
            const isActive = ["creating", "queued", "waiting_invite", "running"].includes(gen.status);
            const canSync = gen.token_id !== null;
            const isOnDemand = gen.token_id === null && gen.user_id !== null;
            const paidAmount = payments.get(gen.farm_id);

            return (
              <Card key={gen.id} className={`glass-card transition-all ${isActive ? "ring-1 ring-primary/30" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      {isActive && (
                        <div className="h-2 w-2 rounded-full bg-success animate-pulse shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{gen.client_name}</p>
                          {isOnDemand && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/50 text-emerald-400 shrink-0">
                              ON-DEMAND
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(gen.created_at), { addSuffix: true, locale: ptBR })}
                          {gen.workspace_name && (
                            <span className="text-foreground">• {gen.workspace_name}</span>
                          )}
                          {isOnDemand && paidAmount !== undefined && (
                            <span className="text-emerald-400 font-medium">• R$ {paidAmount.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          <span className="text-success">{gen.credits_earned}</span>
                          <span className="text-muted-foreground">/{gen.credits_requested}</span>
                        </p>
                      </div>
                      <Badge variant={config.variant}>{config.label}</Badge>
                      {canSync && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={syncing === gen.farm_id}
                          onClick={() => handleSync(gen)}
                          title="Sincronizar com API externa"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${syncing === gen.farm_id ? "animate-spin" : ""}`} />
                        </Button>
                      )}
                    </div>
                  </div>

                  {gen.error_message && (
                    <p className="text-xs text-destructive mt-2">{gen.error_message}</p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
