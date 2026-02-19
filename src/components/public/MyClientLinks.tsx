import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Link2, Loader2 } from "lucide-react";
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

interface MyClientLinksProps {
  userId: string | undefined;
  refreshKey: number;
}

export function MyClientLinks({ userId, refreshKey }: MyClientLinksProps) {
  const [tokens, setTokens] = useState<ClientToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) {
      setTokens([]);
      setLoading(false);
      return;
    }
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("client_tokens")
        .select("id, token, total_credits, credits_used, is_active, created_at")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setTokens(data as ClientToken[]);
      setLoading(false);
    };
    fetch();
  }, [userId, refreshKey]);

  if (!userId || (tokens.length === 0 && !loading)) return null;

  const copyLink = (token: string, id: string) => {
    const url = `https://painelcreditoslovbl.lovable.app/tokenclientes/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast({ title: "Link copiado!" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-6">
      <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-center">
        Meus Links
      </p>
      <div className="space-y-2">
        {tokens.map((t) => {
          const remaining = t.total_credits - t.credits_used;
          const exhausted = remaining <= 0;

          return (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">
                    {t.credits_used}/{t.total_credits} créditos usados
                  </span>
                  {!t.is_active ? (
                    <Badge variant="secondary" className="text-[10px]">Desativado</Badge>
                  ) : exhausted ? (
                    <Badge variant="secondary" className="text-[10px]">Esgotado</Badge>
                  ) : (
                    <Badge variant="default" className="text-[10px]">Ativo</Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Criado: {format(new Date(t.created_at), "dd/MM/yyyy HH:mm")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => copyLink(t.token, t.id)}
              >
                {copiedId === t.id ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
