import { useState, useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, Bot, Loader2, Monitor, TrendingUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface CreditSelectorProps {
  onGenerate: (credits: number) => Promise<void> | void;
  disabled: boolean;
  maxCredits?: number;
  dailyLimit?: number | null;
  remainingDaily?: number | null;
  onUpgradePerUse?: () => void;
  onUpgradeDaily?: () => void;
}

export function CreditSelector({ onGenerate, disabled, maxCredits = 900, dailyLimit, remainingDaily, onUpgradePerUse, onUpgradeDaily }: CreditSelectorProps) {
  const max = maxCredits;
  const [credits, setCredits] = useState(Math.min(100, max));
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const handleGenerate = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onGenerate(credits);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const isDisabled = disabled || submitting;

  const handleSliderChange = (value: number[]) => {
    const rounded = Math.round(value[0] / 5) * 5;
    setCredits(Math.max(5, Math.min(max, rounded)));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) || 0;
    const rounded = Math.round(val / 5) * 5;
    setCredits(Math.max(5, Math.min(max, rounded)));
  };

  const botsNeeded = Math.ceil(credits / 5);

  const isMobile = useIsMobile();

  return (
    <div className="space-y-8">
      {/* Mobile warning */}
      {isMobile && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          <Monitor className="h-4 w-4 shrink-0" />
          <span>Recomendamos usar no computador para evitar erros.</span>
        </div>
      )}

      {/* Credit amount */}
      <div className="text-center space-y-2">
        <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Quantidade de Créditos
        </label>
        <div className="flex items-center justify-center gap-3">
          <Input
            type="number"
            value={credits}
            onChange={handleInputChange}
            min={5}
            max={max}
            step={5}
            className="w-28 text-center text-2xl font-bold bg-secondary border-border h-14"
            disabled={isDisabled}
          />
        </div>
      </div>

      {/* Slider */}
      <div className="px-2">
        <Slider
          value={[credits]}
          onValueChange={handleSliderChange}
          min={5}
          max={max}
          step={5}
          disabled={isDisabled}
          className="w-full"
        />
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>5</span>
          <span>{max}</span>
        </div>
      </div>

      {/* Bots info */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Bots necessários</span>
            </div>
            <span className="text-lg font-bold text-foreground">{botsNeeded}</span>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade per-use limit banner */}
      {onUpgradePerUse && (
        <button
          onClick={onUpgradePerUse}
          className="group w-full flex items-center justify-between rounded-xl border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-emerald-400/5 to-transparent px-4 py-3.5 hover:border-emerald-400/60 hover:from-emerald-500/20 transition-all duration-300"
        >
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-400" />
            <span className="text-sm text-muted-foreground">
              Limite por vez: <span className="font-semibold text-foreground">{max}</span>
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-lg shadow-emerald-500/30 group-hover:shadow-emerald-500/50 transition-shadow">
            50% OFF · Aumentar →
          </span>
        </button>
      )}

      {/* Upgrade daily limit banner */}
      {onUpgradeDaily && (
        <button
          onClick={onUpgradeDaily}
          className="group w-full flex items-center justify-between rounded-xl border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-emerald-400/5 to-transparent px-4 py-3.5 hover:border-emerald-400/60 hover:from-emerald-500/20 transition-all duration-300"
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="text-sm text-muted-foreground">
              Limite diário: <span className="font-semibold text-foreground">{dailyLimit?.toLocaleString() ?? '∞'}</span>
              {remainingDaily != null && <span className="ml-1 text-xs">(restam {remainingDaily.toLocaleString()})</span>}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-lg shadow-emerald-500/30 group-hover:shadow-emerald-500/50 transition-shadow">
            50% OFF · Aumentar →
          </span>
        </button>
      )}

      {/* Generate button */}
      <Button
        onClick={handleGenerate}
        disabled={isDisabled || credits < 5}
        size="lg"
        className="w-full h-14 text-lg font-semibold gap-2 bg-primary hover:bg-primary/90 transition-all"
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Zap className="h-5 w-5" />
        )}
        {submitting ? "Iniciando..." : "Gerar Créditos"}
      </Button>
    </div>
  );
}