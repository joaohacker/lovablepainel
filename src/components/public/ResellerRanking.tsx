import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Crown, Medal, Award } from "lucide-react";

interface RankEntry {
  position: number;
  name: string;
  credits: number;
}

export function ResellerRanking() {
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const CACHE_KEY = "reseller_ranking_v2";
    const CACHE_TTL = 5 * 60 * 60 * 1000; // 5 hours

    const load = async () => {
      // Check cache first
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL && data?.length > 0) {
            setRanking(data);
            setLoading(false);
            return;
          }
        }
      } catch { /* ignore */ }

      try {
        const { data, error } = await supabase.functions.invoke("reseller-ranking");
        if (!error && data?.ranking) {
          const top10 = data.ranking.slice(0, 10);
          setRanking(top10);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: top10, ts: Date.now() }));
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
      <section className="relative z-10 py-10 px-4">
        <div className="mx-auto max-w-2xl">
          <div className="h-6 w-40 mx-auto bg-muted/20 rounded animate-pulse mb-4" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted/10 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (ranking.length === 0) return null;

  const topThree = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  return (
    <section id="ranking" className="relative z-10 py-10 md:py-16 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="text-center space-y-2 mb-6 md:mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-4 py-1.5 text-[10px] md:text-xs font-semibold uppercase tracking-widest text-primary">
            <Trophy className="h-3 w-3 md:h-3.5 md:w-3.5" />
            Ranking de Revendedores
          </div>
          <h2 className="text-xl md:text-3xl font-bold">Top Geradores</h2>
        </div>

        {/* Podium - Top 3 */}
        <div className="grid grid-cols-3 gap-2 md:gap-3 mb-4 md:mb-6">
          {/* 2nd place */}
          <div className="flex flex-col items-center order-1 pt-4 md:pt-6">
            {topThree[1] && (
              <div className="glass-card rounded-xl p-3 md:p-4 w-full text-center border border-border/40 hover:border-border/60 transition-colors">
                <div className="inline-flex items-center justify-center h-8 w-8 md:h-10 md:w-10 rounded-full bg-gray-400/20 mb-2">
                  <Medal className="h-4 w-4 md:h-5 md:w-5 text-gray-300" />
                </div>
                <p className="text-[10px] md:text-xs text-muted-foreground mb-0.5">2º</p>
                <p className="font-semibold text-xs md:text-sm truncate">{topThree[1].name}</p>
                <p className="text-primary font-bold text-sm md:text-base mt-1">
                  {topThree[1].credits.toLocaleString("pt-BR")}
                </p>
                <p className="text-[9px] md:text-[10px] text-muted-foreground">créditos</p>
              </div>
            )}
          </div>

          {/* 1st place */}
          <div className="flex flex-col items-center order-2">
            {topThree[0] && (
              <div className="glass-card rounded-xl p-3 md:p-5 w-full text-center border border-yellow-500/30 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full bg-yellow-500/20 mb-2">
                    <Crown className="h-5 w-5 md:h-6 md:w-6 text-yellow-400" />
                  </div>
                  <p className="text-[10px] md:text-xs text-yellow-400 font-bold mb-0.5">1º</p>
                  <p className="font-bold text-sm md:text-base truncate">{topThree[0].name}</p>
                  <p className="text-primary font-bold text-lg md:text-xl mt-1">
                    {topThree[0].credits.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-[9px] md:text-[10px] text-muted-foreground">créditos</p>
                </div>
              </div>
            )}
          </div>

          {/* 3rd place */}
          <div className="flex flex-col items-center order-3 pt-6 md:pt-8">
            {topThree[2] && (
              <div className="glass-card rounded-xl p-3 md:p-4 w-full text-center border border-border/40 hover:border-border/60 transition-colors">
                <div className="inline-flex items-center justify-center h-8 w-8 md:h-10 md:w-10 rounded-full bg-amber-700/20 mb-2">
                  <Award className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                </div>
                <p className="text-[10px] md:text-xs text-muted-foreground mb-0.5">3º</p>
                <p className="font-semibold text-xs md:text-sm truncate">{topThree[2].name}</p>
                <p className="text-primary font-bold text-sm md:text-base mt-1">
                  {topThree[2].credits.toLocaleString("pt-BR")}
                </p>
                <p className="text-[9px] md:text-[10px] text-muted-foreground">créditos</p>
              </div>
            )}
          </div>
        </div>

        {/* Rest of ranking */}
        {rest.length > 0 && (
          <div className="space-y-1.5 md:space-y-2">
            {rest.map((entry) => (
              <div
                key={entry.position}
                className="flex items-center gap-3 rounded-lg border border-border/20 bg-card/30 backdrop-blur-sm px-3 md:px-4 py-2.5 md:py-3 hover:bg-card/50 transition-colors"
              >
                <span className="text-xs font-bold text-muted-foreground w-6 text-center shrink-0">
                  {entry.position}º
                </span>
                <span className="font-medium text-xs md:text-sm flex-1 truncate">
                  {entry.name}
                </span>
                <div className="shrink-0 text-right">
                  <span className="font-bold text-xs md:text-sm text-primary">
                    {entry.credits.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-[9px] md:text-[10px] text-muted-foreground ml-1">cred.</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
