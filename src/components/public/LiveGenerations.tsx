import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Zap } from "lucide-react";

interface LiveGeneration {
  id: string;
  farm_id: string;
  credits_requested: number;
  credits_earned: number | null;
  status: string;
  client_name: string;
  created_at: string;
}

interface LiveGenerationsProps {
  currentFarmId: string | null;
}

export function LiveGenerations({ currentFarmId }: LiveGenerationsProps) {
  const [generations, setGenerations] = useState<LiveGeneration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGenerations = async () => {
      const { data } = await supabase
        .from("generations")
        .select("id, farm_id, credits_requested, credits_earned, status, client_name, created_at")
        .in("status", ["running", "waiting_invite", "queued", "creating"])
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (data) setGenerations(data as LiveGeneration[]);
      setLoading(false);
    };

    fetchGenerations();
    const interval = setInterval(fetchGenerations, 5000);
    return () => clearInterval(interval);
  }, []);

  const statusLabel = (status: string) => {
    switch (status) {
      case "running": return "⚡ Gerando";
      case "waiting_invite": return "📩 Aguardando convite";
      case "queued": return "⏳ Na fila";
      case "creating": return "🔄 Criando";
      default: return status;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "running": return "text-success";
      case "waiting_invite": return "text-primary";
      case "queued": return "text-amber-400";
      default: return "text-muted-foreground";
    }
  };

  const anonymize = (name: string) => {
    if (!name || name.length < 3) return "***";
    return name[0] + "***" + name[name.length - 1];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando gerações...</span>
      </div>
    );
  }

  if (generations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Zap className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Nenhuma geração ativa no momento</p>
        <p className="text-xs mt-1">As gerações em andamento aparecerão aqui</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground text-center mb-4">
        {generations.length} geração{generations.length > 1 ? "ões" : ""} ativa{generations.length > 1 ? "s" : ""}
      </p>
      {generations.map((gen) => {
        const isCurrent = gen.farm_id === currentFarmId;
        return (
          <div
            key={gen.id}
            className={`rounded-lg border p-4 transition-all ${
              isCurrent
                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                : "border-border/50 bg-secondary/20"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isCurrent && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                    Você
                  </span>
                )}
                <span className="text-sm font-medium text-foreground">
                  {isCurrent ? "Sua geração" : anonymize(gen.client_name)}
                </span>
              </div>
              <span className={`text-xs font-semibold ${statusColor(gen.status)}`}>
                {statusLabel(gen.status)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>{gen.credits_requested} créditos</span>
              {gen.credits_earned !== null && gen.credits_earned > 0 && (
                <span className="text-success font-semibold">+{gen.credits_earned} gerados</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
