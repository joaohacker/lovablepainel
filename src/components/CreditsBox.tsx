import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import lovableLogo from "@/assets/lovable-logo-icon.png";

interface CreditsBoxProps {
  remainingDaily: number | null | undefined;
  dailyLimit: number | null | undefined;
  remainingTotal: number | null | undefined;
  totalLimit: number | null | undefined;
  /** When true, runs a looping fill/drain animation (for demo/landing) */
  demo?: boolean;
}

export function CreditsBox({ remainingDaily, dailyLimit, remainingTotal, totalLimit, demo }: CreditsBoxProps) {
  const hasDaily = remainingDaily != null && dailyLimit != null && dailyLimit > 0;
  const hasTotal = remainingTotal != null && totalLimit != null && totalLimit > 0;

  const remaining = hasDaily ? remainingDaily : hasTotal ? remainingTotal : 0;
  const limit = hasDaily ? dailyLimit : hasTotal ? totalLimit : 0;
  const label = hasDaily ? "Credits" : "Credits";
  const show = hasDaily || hasTotal;

  // --- Demo loop animation ---
  const [demoValue, setDemoValue] = useState(0);
  const [demoPercentage, setDemoPercentage] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!demo) return;
    const maxVal = limit || 1000;
    const cycleDuration = 6000;
    let start: number | null = null;

    const tick = (timestamp: number) => {
      if (start === null) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / cycleDuration, 1);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const pct = eased * 100;
      const val = Math.round((pct / 100) * maxVal);

      setDemoPercentage(pct);
      setDemoValue(val);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [demo, limit]);

  // --- Static animation (non-demo) ---
  const [animatedValue, setAnimatedValue] = useState(0);
  useEffect(() => {
    if (demo) return;
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
  }, [remaining, show, demo]);

  if (!show && !demo) return null;

  const displayValue = demo ? demoValue : animatedValue;
  const displayPercentage = demo
    ? demoPercentage
    : limit > 0 ? Math.min(100, Math.max(0, (remaining / limit) * 100)) : 0;
  const displayLabel = demo ? "Credits" : label;
  const displayLimit = demo ? (limit || 1000) : limit;

  return (
    <Card className="glass-card overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <img src={lovableLogo} alt="Logo" className="h-4 w-4" />
            <span className="text-sm font-semibold text-foreground">{displayLabel}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold tabular-nums text-foreground">{displayValue}</span>
            <span className="text-xs text-muted-foreground">left</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-primary/80 to-primary relative"
            style={{
              width: `${displayPercentage}%`,
              transition: demo ? 'none' : 'width 1s ease-out',
            }}
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div className="credits-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
