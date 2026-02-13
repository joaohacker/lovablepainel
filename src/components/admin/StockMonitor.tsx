import { useEffect, useState } from "react";
import { fetchStock, type StockResponse } from "@/lib/farm-api";
import { Card, CardContent } from "@/components/ui/card";
import { Bot, Cpu, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StockMonitor() {
  const [stock, setStock] = useState<StockResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadStock = async () => {
    try {
      const data = await fetchStock();
      setStock(data);
      setError(false);
      setLastUpdate(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStock();
    const interval = setInterval(loadStock, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-4 text-center text-muted-foreground text-sm">
          Carregando estoque...
        </CardContent>
      </Card>
    );
  }

  if (error || !stock) {
    return (
      <Card className="glass-card border-destructive/30">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-destructive">
            <WifiOff className="h-4 w-4" />
            <span className="text-sm">Estoque indisponível</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadStock}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  const cap = stock.capacity;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-success" />
          <h3 className="text-sm font-semibold text-foreground">Estoque em Tempo Real</h3>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-muted-foreground">
              {lastUpdate.toLocaleTimeString("pt-BR")}
            </span>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadStock}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="glass-card">
          <CardContent className="p-3 text-center">
            <Bot className="h-5 w-5 text-success mx-auto mb-1" />
            <p className="text-2xl font-bold text-success">{stock.activeWithBonus.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Disponíveis</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-3 text-center">
            <Bot className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold">{stock.total.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-3 text-center">
            <Cpu className="h-5 w-5 text-amber-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-amber-400">{cap.active}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Em Uso</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-3 text-center">
            <Cpu className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold">{cap.queued + cap.waiting}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Na Fila</p>
          </CardContent>
        </Card>
      </div>

      {/* Capacity bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Capacidade</span>
          <span>{cap.active}/{cap.maxConcurrent}</span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${Math.min(100, (cap.active / cap.maxConcurrent) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
