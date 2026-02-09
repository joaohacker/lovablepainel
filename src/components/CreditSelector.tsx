import { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchStock, type StockResponse } from "@/lib/farm-api";
import { Zap, Bot, Package } from "lucide-react";

interface CreditSelectorProps {
  onGenerate: (credits: number) => void;
  disabled: boolean;
}

export function CreditSelector({ onGenerate, disabled }: CreditSelectorProps) {
  const [credits, setCredits] = useState(100);
  const [stock, setStock] = useState<StockResponse | null>(null);
  const [stockLoading, setStockLoading] = useState(true);

  useEffect(() => {
    const loadStock = async () => {
      try {
        const data = await fetchStock();
        setStock(data);
      } catch {
        // Stock unavailable
      } finally {
        setStockLoading(false);
      }
    };
    loadStock();
    const interval = setInterval(loadStock, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSliderChange = (value: number[]) => {
    const rounded = Math.round(value[0] / 5) * 5;
    setCredits(Math.max(5, Math.min(5005, rounded)));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) || 0;
    const rounded = Math.round(val / 5) * 5;
    setCredits(Math.max(5, Math.min(5005, rounded)));
  };

  const botsNeeded = Math.ceil(credits / 5);

  return (
    <div className="space-y-8">
      {/* Stock indicator */}
      <div className="flex items-center justify-center gap-2 text-sm">
        <Package className="h-4 w-4 text-muted-foreground" />
        {stockLoading ? (
          <span className="text-muted-foreground">Verificando estoque...</span>
        ) : stock ? (
          <span className="text-muted-foreground">
            <span className="font-semibold text-success">{stock.active.toLocaleString()}</span> bots disponíveis
          </span>
        ) : (
          <span className="text-muted-foreground">Estoque indisponível</span>
        )}
      </div>

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
            max={5005}
            step={5}
            className="w-28 text-center text-2xl font-bold bg-secondary border-border h-14"
            disabled={disabled}
          />
        </div>
      </div>

      {/* Slider */}
      <div className="px-2">
        <Slider
          value={[credits]}
          onValueChange={handleSliderChange}
          min={5}
          max={5005}
          step={5}
          disabled={disabled}
          className="w-full"
        />
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>5</span>
          <span>5005</span>
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

      {/* Generate button */}
      <Button
        onClick={() => onGenerate(credits)}
        disabled={disabled || credits < 5}
        size="lg"
        className="w-full h-14 text-lg font-semibold gap-2 bg-primary hover:bg-primary/90 transition-all"
      >
        <Zap className="h-5 w-5" />
        Gerar Créditos
      </Button>
    </div>
  );
}
