import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface LiveGeneration {
  id: string;
  farm_id: string;
  credits_requested: number;
  credits_earned: number | null;
  status: string;
  client_name: string;
  created_at: string;
  isFake?: boolean;
}

interface LiveGenerationsProps {
  currentFarmId: string | null;
}

const FAKE_NAMES = [
  "Lucas M.", "Ana S.", "Pedro R.", "Julia C.", "Marcos T.",
  "Camila F.", "Rafael B.", "Isabela L.", "Thiago P.", "Fernanda A.",
  "Gabriel O.", "Larissa N.", "Bruno D.", "Beatriz V.", "Diego H.",
];

const FAKE_STATUSES: Array<{ status: string; weight: number }> = [
  { status: "running", weight: 5 },
  { status: "waiting_invite", weight: 3 },
  { status: "queued", weight: 2 },
];

function pickWeightedStatus() {
  const total = FAKE_STATUSES.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * total;
  for (const f of FAKE_STATUSES) {
    r -= f.weight;
    if (r <= 0) return f.status;
  }
  return "running";
}

function generateFakeGenerations(): LiveGeneration[] {
  const count = 4 + Math.floor(Math.random() * 5);
  const shuffled = [...FAKE_NAMES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((name, i) => {
    const creditOptions = [50, 100, 200, 300, 500, 1000, 1500, 2000];
    const credits = creditOptions[Math.floor(Math.random() * creditOptions.length)];
    const status = pickWeightedStatus();
    const earned = status === "running" ? Math.floor(Math.random() * credits * 0.7) : null;
    return {
      id: `fake-${i}`,
      farm_id: `fake-farm-${i}`,
      credits_requested: credits,
      credits_earned: earned,
      status,
      client_name: name,
      created_at: new Date(Date.now() - Math.random() * 600000).toISOString(),
      isFake: true,
    };
  });
}

export function LiveGenerations({ currentFarmId }: LiveGenerationsProps) {
  const [realGenerations, setRealGenerations] = useState<LiveGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [fakeGenerations, setFakeGenerations] = useState<LiveGeneration[]>(() => generateFakeGenerations());

  useEffect(() => {
    const interval = setInterval(() => {
      setFakeGenerations(generateFakeGenerations());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchGenerations = async () => {
      const { data } = await supabase
        .from("generations")
        .select("id, farm_id, credits_requested, credits_earned, status, client_name, created_at")
        .in("status", ["running", "waiting_invite", "queued", "creating"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (data) setRealGenerations(data as LiveGeneration[]);
      setLoading(false);
    };

    fetchGenerations();
    const interval = setInterval(fetchGenerations, 5000);
    return () => clearInterval(interval);
  }, []);

  const allGenerations = useMemo(() => {
    const merged = [...realGenerations, ...fakeGenerations];
    merged.sort((a, b) => {
      const aCurrent = a.farm_id === currentFarmId ? 1 : 0;
      const bCurrent = b.farm_id === currentFarmId ? 1 : 0;
      if (aCurrent !== bCurrent) return bCurrent - aCurrent;
      const aReal = a.isFake ? 0 : 1;
      const bReal = b.isFake ? 0 : 1;
      if (aReal !== bReal) return bReal - aReal;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return merged;
  }, [realGenerations, fakeGenerations, currentFarmId]);

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
        </span>
        <p className="text-sm font-medium text-muted-foreground">
          {allGenerations.length} geração{allGenerations.length > 1 ? "ões" : ""} ativa{allGenerations.length > 1 ? "s" : ""}
        </p>
      </div>
      {allGenerations.map((gen) => {
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