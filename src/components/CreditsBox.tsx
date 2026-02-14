import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Zap } from "lucide-react";

interface CreditsBoxProps {
  remainingDaily: number | null | undefined;
  dailyLimit: number | null | undefined;
  remainingTotal: number | null | undefined;
  totalLimit: number | null | undefined;
}

export function CreditsBox({ remainingDaily, dailyLimit, remainingTotal, totalLimit }: CreditsBoxProps) {
  const hasDaily = remainingDaily != null && dailyLimit != null && dailyLimit > 0;
  const hasTotal = remainingTotal != null && totalLimit != null && totalLimit > 0;

  const remaining = hasDaily ? remainingDaily : hasTotal ? remainingTotal : 0;
  const limit = hasDaily ? dailyLimit : hasTotal ? totalLimit : 0;
  const label = hasDaily ? "Créditos diários" : "Créditos restantes";
  const show = hasDaily || hasTotal;

  const percentage = limit > 0 ? Math.min(100, Math.max(0, (remaining / limit) * 100)) : 0;

  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    if (!show || remaining <= 0) { setAnimatedValue(remaining); return; }
    const duration = 800;
    const steps = 30;
    const stepTime = duration / steps;
    let current = 0;
    const increment = remaining / steps;

    const timer = setInterval(() => {
      current += increment;
      if (current >= remaining) {
        setAnimatedValue(remaining);
        clearInterval(timer);
      } else {
        setAnimatedValue(Math.floor(current));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [remaining, show]);

  if (!show) return null;

  return (
    <Card className="glass-card overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">{label}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold tabular-nums text-foreground">{animatedValue}</span>
            <span className="text-xs text-muted-foreground">restantes</span>
          </div>
        </div>

        {/* Progress bar with shimmer animation */}
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-primary/80 to-primary transition-all duration-1000 ease-out relative"
            style={{ width: `${percentage}%` }}
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div className="credits-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />
            {hasDaily ? "Reseta diariamente às 12:00 (Brasília)" : `${remaining} de ${limit} usos`}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
