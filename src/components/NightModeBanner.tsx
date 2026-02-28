import { useState, useEffect, useMemo } from "react";
import { Moon, Clock } from "lucide-react";

/**
 * Returns true if currently in maintenance/night mode.
 * Maintenance until 2026-02-28 23:00 UTC (20:00 BRT), then regular night mode.
 */
export function isNightModeBRT(): boolean {
  const now = new Date();
  const maintenanceEnd = new Date("2026-02-28T23:00:00Z");
  if (now < maintenanceEnd) return true;
  const brtHour = (now.getUTCHours() - 3 + 24) % 24;
  return brtHour >= 0 && brtHour < 12;
}

function getResumeTime(): Date {
  const now = new Date();
  const maintenanceEnd = new Date("2026-02-28T23:00:00Z");
  if (now < maintenanceEnd) return maintenanceEnd;
  const next = new Date(now);
  next.setUTCHours(15, 0, 0, 0);
  if (now >= next) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface NightModeBannerProps {
  /** Optional ISO string for when generations resume. If not provided, calculates automatically. */
  resumesAt?: string;
}

export function NightModeBanner({ resumesAt }: NightModeBannerProps) {
  const target = useMemo(() => {
    if (resumesAt) return new Date(resumesAt);
    return getResumeTime();
  }, [resumesAt]);

  const [remaining, setRemaining] = useState(() => Math.max(0, target.getTime() - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.max(0, target.getTime() - Date.now());
      setRemaining(diff);
      if (diff <= 0) {
        clearInterval(interval);
        // Auto-reload to re-check availability
        setTimeout(() => window.location.reload(), 2000);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [target]);

  return (
    <div className="flex flex-col items-center gap-5 py-8">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl animate-pulse" />
        <Moon className="relative h-14 w-14 text-amber-400" />
      </div>

      <h2 className="text-xl font-extrabold text-foreground text-center">
        🔧 Manutenção em Andamento
      </h2>

      <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
        Guardando bots no estoque. Voltamos às <span className="font-bold text-foreground">20h</span> (horário de Brasília)!
      </p>

      {/* Countdown timer */}
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-6 py-4">
        <Clock className="h-5 w-5 text-amber-400 shrink-0" />
        <div className="text-center">
          <p className="text-xs text-amber-300/70 uppercase tracking-wider font-medium mb-1">Volta em</p>
          <p className="text-3xl font-mono font-bold text-amber-300 tabular-nums">
            {formatCountdown(remaining)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 w-full max-w-sm">
        <p className="text-xs text-amber-300/80 text-center leading-relaxed">
          ⏳ A página será atualizada automaticamente quando as gerações voltarem.
        </p>
      </div>
    </div>
  );
}
