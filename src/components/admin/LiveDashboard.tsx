import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, Zap, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Generation {
  id: string;
  farm_id: string;
  token_id: string | null;
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
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  const handleSync = async (gen: Generation) => {
    setSyncing(gen.farm_id);
    try {
      // Find the token value for this generation
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

  useEffect(() => {
    // Fetch initial data
    const fetchGenerations = async () => {
      const { data } = await supabase
        .from("generations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setGenerations(data);
      setLoading(false);
    };

    fetchGenerations();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("generations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generations" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setGenerations((prev) => [payload.new as Generation, ...prev].slice(0, 50));
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

  const activeCount = generations.filter(
    (g) => ["creating", "queued", "waiting_invite", "running"].includes(g.status)
  ).length;

  const totalCredits = generations
    .filter((g) => g.status === "completed")
    .reduce((sum, g) => sum + g.credits_earned, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Monitoramento ao Vivo</h2>
        <p className="text-sm text-muted-foreground">Acompanhe as gerações em tempo real</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Ativas agora</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <Zap className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalCredits.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Créditos gerados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{generations.length}</p>
              <p className="text-xs text-muted-foreground">Total gerações</p>
            </div>
          </CardContent>
        </Card>
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

            return (
              <Card key={gen.id} className={`glass-card transition-all ${isActive ? "ring-1 ring-primary/30" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      {isActive && (
                        <div className="h-2 w-2 rounded-full bg-success animate-pulse shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{gen.client_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(gen.created_at), { addSuffix: true, locale: ptBR })}
                          {gen.workspace_name && (
                            <span className="text-foreground">• {gen.workspace_name}</span>
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
                      {isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={syncing === gen.farm_id}
                          onClick={() => handleSync(gen)}
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
