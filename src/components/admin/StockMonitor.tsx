import { Card, CardContent } from "@/components/ui/card";

export function StockMonitor() {
  return (
    <Card className="glass-card mb-6">
      <CardContent className="p-4 text-center text-muted-foreground text-sm">
        Estoque indisponível — backend removido.
      </CardContent>
    </Card>
  );
}
