import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert, ArrowUpDown, Clock, DollarSign, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FraudAttempt {
  id: string;
  user_id: string | null;
  ip_address: string | null;
  action: string;
  details: any;
  created_at: string;
}

interface AuditEntry {
  id: string;
  wallet_id: string;
  user_id: string;
  old_balance: number;
  new_balance: number;
  change_amount: number;
  source: string;
  changed_at: string;
}

interface SuspiciousGeneration {
  id: string;
  client_name: string;
  credits_requested: number;
  credits_earned: number | null;
  status: string;
  user_id: string | null;
  farm_id: string;
  created_at: string;
  settled_at: string | null;
}

const actionLabels: Record<string, { label: string; severity: "destructive" | "default" | "secondary" }> = {
  rate_limit_exceeded: { label: "Rate Limit", severity: "default" },
  auto_banned: { label: "AUTO-BAN", severity: "destructive" },
  balance_discrepancy: { label: "Discrepância", severity: "destructive" },
  amount_mismatch: { label: "Valor Diferente", severity: "destructive" },
};

export function SecurityDashboard() {
  const [fraudAttempts, setFraudAttempts] = useState<FraudAttempt[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [suspiciousGens, setSuspiciousGens] = useState<SuspiciousGeneration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      const [fraudRes, auditRes, gensRes] = await Promise.all([
        supabase
          .from("fraud_attempts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("balance_audit_log")
          .select("*")
          .order("changed_at", { ascending: false })
          .limit(100),
        // Suspicious: large generations (>2000 credits), or refunded with 0 earned
        supabase
          .from("generations")
          .select("id, client_name, credits_requested, credits_earned, status, user_id, farm_id, created_at, settled_at")
          .or("credits_requested.gte.2000,and(settled_at.not.is.null,credits_earned.eq.0)")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (fraudRes.data) setFraudAttempts(fraudRes.data);
      if (auditRes.data) setAuditLog(auditRes.data);
      if (gensRes.data) setSuspiciousGens(gensRes.data);
      setLoading(false);
    };

    fetchAll();

    // Realtime for fraud_attempts
    const fraudChannel = supabase
      .channel("fraud-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "fraud_attempts" }, (payload) => {
        setFraudAttempts((prev) => [payload.new as FraudAttempt, ...prev].slice(0, 100));
      })
      .subscribe();

    // Realtime for balance_audit_log
    const auditChannel = supabase
      .channel("audit-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "balance_audit_log" }, (payload) => {
        setAuditLog((prev) => [payload.new as AuditEntry, ...prev].slice(0, 100));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(fraudChannel);
      supabase.removeChannel(auditChannel);
    };
  }, []);

  // Detect anomalies in audit log
  const largeCredits = auditLog.filter((e) => e.source === "credit" && e.change_amount > 50);
  const rapidRefunds = (() => {
    const byUser = new Map<string, AuditEntry[]>();
    auditLog
      .filter((e) => e.source === "credit" && e.change_amount > 0)
      .forEach((e) => {
        const list = byUser.get(e.user_id) || [];
        list.push(e);
        byUser.set(e.user_id, list);
      });
    const suspicious: { user_id: string; count: number; total: number }[] = [];
    byUser.forEach((entries, uid) => {
      // 3+ credits in last hour
      const recent = entries.filter(
        (e) => Date.now() - new Date(e.changed_at).getTime() < 3600000
      );
      if (recent.length >= 3) {
        suspicious.push({
          user_id: uid,
          count: recent.length,
          total: recent.reduce((s, e) => s + e.change_amount, 0),
        });
      }
    });
    return suspicious;
  })();

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Carregando dados de segurança...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-destructive" />
          Painel de Segurança
        </h2>
        <p className="text-sm text-muted-foreground">Fraudes, audit log e anomalias em tempo real</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="glass-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <div>
                <p className="text-xl font-bold">{fraudAttempts.length}</p>
                <p className="text-[11px] text-muted-foreground">Fraud Attempts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xl font-bold">{auditLog.length}</p>
                <p className="text-[11px] text-muted-foreground">Audit Entries</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-xl font-bold">{largeCredits.length}</p>
                <p className="text-[11px] text-muted-foreground">Créditos &gt; R$50</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-xl font-bold">{suspiciousGens.length}</p>
                <p className="text-[11px] text-muted-foreground">Gerações Suspeitas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rapid Refund Alert */}
      {rapidRefunds.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <h3 className="font-semibold text-destructive flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" />
              ⚠️ Reembolsos Rápidos Detectados
            </h3>
            {rapidRefunds.map((r) => (
              <div key={r.user_id} className="text-sm">
                <span className="font-mono text-xs">{r.user_id.slice(0, 8)}…</span>
                <span className="text-muted-foreground">
                  {" "}— {r.count} créditos em 1h, total R$ {r.total.toFixed(2)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Fraud Attempts */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Fraud Attempts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
          {fraudAttempts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tentativa de fraude registrada ✅</p>
          ) : (
            fraudAttempts.map((f) => {
              const config = actionLabels[f.action] || { label: f.action, severity: "secondary" as const };
              return (
                <div key={f.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={config.severity} className="text-[10px]">
                        {config.label}
                      </Badge>
                      {f.ip_address && (
                        <span className="text-[10px] font-mono text-muted-foreground">{f.ip_address}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(f.created_at), { addSuffix: true, locale: ptBR })}
                      {f.user_id && (
                        <span className="font-mono ml-1">{f.user_id.slice(0, 8)}…</span>
                      )}
                    </div>
                    {f.details && typeof f.details === "object" && (
                      <pre className="text-[10px] text-muted-foreground mt-1 whitespace-pre-wrap break-all">
                        {JSON.stringify(f.details, null, 1)}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Suspicious Generations */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Gerações Suspeitas
            <span className="text-xs text-muted-foreground font-normal">(≥2000 créditos ou 0 entregues com reembolso)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
          {suspiciousGens.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma geração suspeita ✅</p>
          ) : (
            suspiciousGens.map((g) => {
              const isZeroEarned = g.settled_at && (g.credits_earned === 0 || g.credits_earned === null);
              return (
                <div key={g.id} className={`flex items-start gap-3 p-3 rounded-lg border ${isZeroEarned ? "bg-destructive/5 border-destructive/30" : "bg-secondary/30 border-border/50"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{g.client_name}</span>
                      <Badge variant={isZeroEarned ? "destructive" : "outline"} className="text-[10px]">
                        {isZeroEarned ? "0 ENTREGUES" : `${g.credits_requested} CRÉDITOS`}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">{g.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(g.created_at), { addSuffix: true, locale: ptBR })}
                      <span className="ml-1">
                        {g.credits_earned ?? 0}/{g.credits_requested} créditos
                      </span>
                      {g.user_id && <span className="font-mono ml-1">{g.user_id.slice(0, 8)}…</span>}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground block mt-0.5">Farm: {g.farm_id}</span>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Balance Audit Log */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-primary" />
            Balance Audit Log
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {auditLog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum registro no audit log.</p>
          ) : (
            auditLog.map((e) => {
              const isLarge = e.source === "credit" && e.change_amount > 50;
              return (
                <div key={e.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${isLarge ? "bg-amber-500/5 border-amber-500/30" : "bg-secondary/20 border-border/30"}`}>
                  <Badge variant={e.source === "credit" ? "default" : "secondary"} className="text-[10px] shrink-0 w-14 justify-center">
                    {e.source === "credit" ? "+" : "−"} R$ {Math.abs(e.change_amount).toFixed(2)}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        R$ {e.old_balance.toFixed(2)} → R$ {e.new_balance.toFixed(2)}
                      </span>
                      {isLarge && <Badge variant="outline" className="text-[9px] text-amber-500 border-amber-500/50">ALTO</Badge>}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {formatDistanceToNow(new Date(e.changed_at), { addSuffix: true, locale: ptBR })}
                      <span className="font-mono ml-1">{e.user_id.slice(0, 8)}…</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
