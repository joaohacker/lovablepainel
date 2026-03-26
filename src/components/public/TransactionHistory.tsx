import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/pricing";
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, ChevronDown, ChevronUp, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  credits: number | null;
  description: string;
  created_at: string;
}

interface TransactionHistoryProps {
  walletId: string | undefined;
}

export function TransactionHistory({ walletId }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!walletId || !expanded) return;
    setLoading(true);
    supabase
      .from("wallet_transactions")
      .select("id, type, amount, credits, description, created_at")
      .eq("wallet_id", walletId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setTransactions(data ?? []);
        setLoading(false);
      });
  }, [walletId, expanded]);

  if (!walletId) return null;

  const visible = showAll ? transactions : transactions.slice(0, 5);

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-2">
          <History className="h-4 w-4" />
          Histórico de Transações
        </span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma transação ainda.</p>
          ) : (
            <>
              {visible.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-start gap-3 rounded-lg border border-border/30 bg-background/50 px-3 py-2.5"
                >
                  <div className="shrink-0 mt-0.5">
                    {tx.type === "deposit" ? (
                      <ArrowDownCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <ArrowUpCircle className="h-4 w-4 text-red-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground leading-snug truncate">
                      {tx.description || (tx.type === "deposit" ? "Depósito" : "Débito")}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {format(new Date(tx.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-xs font-semibold ${tx.type === "deposit" ? "text-green-500" : "text-red-400"}`}>
                      {tx.type === "deposit" ? "+" : "-"}{formatBRL(tx.amount)}
                    </p>
                    {tx.credits != null && tx.credits > 0 && (
                      <p className="text-[10px] text-muted-foreground">{tx.credits} créd.</p>
                    )}
                  </div>
                </div>
              ))}
              {transactions.length > 5 && !showAll && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => setShowAll(true)}
                >
                  Ver mais ({transactions.length - 5} restantes)
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
