import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Medal, Award, Crown } from "lucide-react";

interface RankEntry {
  position: number;
  name: string;
  credits: number;
}

export function ResellerRanking() {
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("reseller-ranking");
        if (!error && data?.ranking) {
          setRanking(data.ranking);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <section className="relative z-10 py-14 md:py-24 px-4">
        <div className="mx-auto max-w-3xl text-center">
          <div className="h-8 w-48 mx-auto bg-muted/20 rounded animate-pulse" />
        </div>
      </section>
    );
  }

  if (ranking.length === 0) return null;

  const positionIcon = (pos: number) => {
    if (pos === 1) return <Crown className="h-5 w-5 text-yellow-400" />;
    if (pos === 2) return <Medal className="h-5 w-5 text-gray-300" />;
    if (pos === 3) return <Award className="h-5 w-5 text-amber-600" />;
    return <span className="text-xs font-bold text-muted-foreground w-5 text-center">{pos}º</span>;
  };

  const positionBg = (pos: number) => {
    if (pos === 1) return "bg-yellow-400/10 border-yellow-400/30";
    if (pos === 2) return "bg-gray-300/10 border-gray-300/20";
    if (pos === 3) return "bg-amber-600/10 border-amber-600/20";
    return "bg-white/5 border-border/30";
  };

  return (
    <section className="relative z-10 py-14 md:py-24 px-4">
      <div className="mx-auto max-w-2xl text-center space-y-3 mb-8 md:mb-12">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
          <Trophy className="h-3.5 w-3.5" />
          Ranking
        </div>
        <h2 className="text-2xl md:text-5xl font-bold">Top Revendedores</h2>
        <p className="text-muted-foreground text-sm md:text-lg">
          Os maiores geradores de créditos da plataforma.
        </p>
      </div>

      <div className="mx-auto max-w-xl space-y-2">
        {ranking.map((entry) => (
          <div
            key={entry.position}
            className={`flex items-center gap-3 md:gap-4 rounded-xl border px-4 py-3 md:py-4 backdrop-blur-sm transition-colors ${positionBg(entry.position)}`}
          >
            <div className="shrink-0 flex items-center justify-center w-8">
              {positionIcon(entry.position)}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-sm md:text-base truncate block">
                {entry.name}
              </span>
            </div>
            <div className="shrink-0 text-right">
              <span className="font-bold text-sm md:text-base text-primary">
                {entry.credits.toLocaleString("pt-BR")}
              </span>
              <span className="text-[10px] md:text-xs text-muted-foreground ml-1">créditos</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
