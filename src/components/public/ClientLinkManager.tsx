import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Search,
  Copy,
  Check,
  XCircle,
  Loader2,
  ExternalLink,
  Clock,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ClientToken {
  id: string;
  token: string;
  total_credits: number;
  credits_used: number;
  is_active: boolean;
  created_at: string;
}

interface Generation {
  id: string;
  status: string;
  credits_requested: number;
  credits_earned: number | null;
  workspace_name: string | null;
  master_email: string | null;
  created_at: string;
  updated_at: string;
  farm_id: string;
  error_message: string | null;
}

interface Props {
  userId: string | undefined;
  refreshKey: number;
}

type FilterType = "all" | "active" | "exhausted" | "disabled";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  running: { label: "Gerando", color: "bg-blue-500/20 text-blue-400" },
  completed: { label: "Concluído", color: "bg-green-500/20 text-green-400" },
  waiting_invite: { label: "Aguardando convite", color: "bg-yellow-500/20 text-yellow-400" },
  queued: { label: "Na fila", color: "bg-purple-500/20 text-purple-400" },
  creating: { label: "Criando", color: "bg-muted text-muted-foreground" },
  error: { label: "Erro", color: "bg-destructive/20 text-destructive" },
  expired: { label: "Expirado", color: "bg-orange-500/20 text-orange-400" },
  cancelled: { label: "Cancelado", color: "bg-muted text-muted-foreground" },
};

function getTokenStatus(t: ClientToken): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (!t.is_active) return { label: "Desativado", variant: "destructive" };
  if (t.credits_used >= t.total_credits) return { label: "Esgotado", variant: "secondary" };
  return { label: "Ativo", variant: "default" };
}

export function ClientLinkManager({ userId, refreshKey }: Props) {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<ClientToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Details sheet
  const [selectedToken, setSelectedToken] = useState<ClientToken | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!userId) { setTokens([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-client-token", {
        body: { action: "list", search: search || undefined, filter: filter === "all" ? undefined : filter },
      });
      if (error) throw error;
      setTokens(data?.tokens || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [userId, search, filter]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens, refreshKey]);

  // Debounce search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const openDetails = async (tok: ClientToken) => {
    setSelectedToken(tok);
    setLoadingDetails(true);
    setGenerations([]);
    try {
      const { data, error } = await supabase.functions.invoke("manage-client-token", {
        body: { action: "details", tokenId: tok.id },
      });
      if (error) throw error;
      setGenerations(data?.generations || []);
      // Update token data from server
      if (data?.token) {
        setSelectedToken(data.token);
      }
    } catch {
      toast({ title: "Erro ao carregar detalhes", variant: "destructive" });
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDeactivate = async () => {
    if (!selectedToken) return;
    setDeactivating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-client-token", {
        body: { action: "deactivate", tokenId: selectedToken.id },
      });
      if (error) throw error;
      if (data?.refunded) {
        toast({ title: "Link desativado e reembolsado", description: `R$ ${Number(data.refund_amount).toFixed(2)} devolvidos ao saldo` });
      } else {
        toast({ title: "Link desativado com sucesso" });
      }
      setSelectedToken((prev) => prev ? { ...prev, is_active: false } : null);
      fetchTokens();
    } catch (err: any) {
      toast({ title: "Erro ao desativar", description: err?.message, variant: "destructive" });
    } finally {
      setDeactivating(false);
    }
  };

  const copyLink = (token: string, id: string) => {
    const url = `https://painelcreditoslovbl.lovable.app/tokenclientes/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast({ title: "Link copiado!" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!userId) return null;

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "active", label: "Ativos" },
    { key: "exhausted", label: "Esgotados" },
    { key: "disabled", label: "Desativados" },
  ];

  return (
    <div className="space-y-4 mt-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-center">
        Meus Links
      </h3>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por token..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              filter === f.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground hover:border-primary/30"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : tokens.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-4">
          {search ? "Nenhum link encontrado" : "Nenhum link criado ainda"}
        </p>
      ) : (
        <div className="space-y-2">
          {tokens.map((tok) => {
            const status = getTokenStatus(tok);
            const remaining = tok.total_credits - tok.credits_used;
            return (
              <div
                key={tok.id}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 px-4 py-3 cursor-pointer hover:bg-secondary/50 transition-colors"
                onClick={() => openDetails(tok)}
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {tok.token.slice(0, 8)}...
                    </code>
                    <Badge variant={status.variant} className="text-[10px]">
                      {status.label}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {tok.credits_used}/{tok.total_credits} usados • {format(new Date(tok.created_at), "dd/MM/yy")}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyLink(tok.token, tok.id);
                    }}
                  >
                    {copiedId === tok.id ? (
                      <Check className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details Sheet */}
      <Sheet open={!!selectedToken} onOpenChange={(open) => !open && setSelectedToken(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes do Link</SheetTitle>
            <SheetDescription>Informações e histórico de gerações</SheetDescription>
          </SheetHeader>

          {selectedToken && (
            <div className="mt-6 space-y-6">
              {/* Token info */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Token</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs">{selectedToken.token.slice(0, 12)}...</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyLink(selectedToken.token, selectedToken.id)}
                    >
                      {copiedId === selectedToken.id ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={getTokenStatus(selectedToken).variant}>
                    {getTokenStatus(selectedToken).label}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Créditos</span>
                  <span className="text-sm font-medium">
                    {selectedToken.credits_used} / {selectedToken.total_credits}{" "}
                    <span className="text-muted-foreground">
                      ({selectedToken.total_credits - selectedToken.credits_used} restantes)
                    </span>
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Criado em</span>
                  <span className="text-sm">
                    {format(new Date(selectedToken.created_at), "dd/MM/yyyy HH:mm")}
                  </span>
                </div>
              </div>

              {/* Deactivate button */}
              {selectedToken.is_active && (
                <>
                  <Button
                    variant="destructive"
                    className="w-full gap-2"
                    onClick={handleDeactivate}
                    disabled={deactivating}
                  >
                    {deactivating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {selectedToken.credits_used === 0
                      ? "Desativar e Reembolsar"
                      : "Desativar Link"}
                  </Button>
                  {selectedToken.credits_used === 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Nenhum crédito usado — o valor será devolvido ao seu saldo
                    </p>
                  )}
                  {selectedToken.credits_used > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Créditos já foram usados — reembolso não disponível
                    </p>
                  )}
                </>
              )}

              {/* Generations history */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Histórico de Gerações
                </h4>

                {loadingDetails ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : generations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma geração ainda
                  </p>
                ) : (
                  <div className="space-y-2">
                    {generations.map((gen) => {
                      const s = STATUS_MAP[gen.status] || {
                        label: gen.status,
                        color: "bg-muted text-muted-foreground",
                      };
                      const isActive = ["running", "waiting_invite", "queued", "creating"].includes(gen.status);
                      return (
                        <div
                          key={gen.id}
                          className={`rounded-lg border p-3 space-y-2 ${
                            isActive
                              ? "border-primary/30 bg-primary/5"
                              : "border-border/50 bg-secondary/20"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${s.color}`}>
                              {s.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(gen.created_at), "dd/MM HH:mm")}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Créditos</span>
                            <span>
                              {gen.credits_earned ?? 0} / {gen.credits_requested}
                            </span>
                          </div>

                          {gen.workspace_name && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Workspace</span>
                              <span className="truncate max-w-[150px]">{gen.workspace_name}</span>
                            </div>
                          )}

                          {isActive && (
                            <div className="flex items-center gap-1.5 text-xs text-primary">
                              <Zap className="h-3 w-3" />
                              <span>
                                {gen.status === "running"
                                  ? `Gerando... ${gen.credits_earned ?? 0} créditos`
                                  : gen.status === "waiting_invite"
                                  ? "Aguardando convite do cliente"
                                  : gen.status === "queued"
                                  ? "Na fila de espera"
                                  : "Criando..."}
                              </span>
                            </div>
                          )}

                          {gen.error_message && (
                            <div className="flex items-center gap-1.5 text-xs text-destructive">
                              <AlertTriangle className="h-3 w-3" />
                              <span className="truncate">{gen.error_message}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
