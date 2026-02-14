import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Copy, Check, Trash2, ExternalLink, Loader2, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Token {
  id: string;
  token: string;
  client_name: string;
  total_limit: number | null;
  daily_limit: number | null;
  credits_per_use: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export function TokenManager() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  // Form state — defaults for quick creation
  const [clientName, setClientName] = useState("guilherme");
  const [totalLimit, setTotalLimit] = useState("");
  const [dailyLimit, setDailyLimit] = useState("5000");
  const [creditsPerUse, setCreditsPerUse] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string | null>(null);

  const fetchTokens = async () => {
    const { data, error } = await supabase
      .from("tokens")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setTokens(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const createToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const payload: any = {
        client_name: clientName,
        created_by: user.id,
      };

      if (creditsPerUse) payload.credits_per_use = parseInt(creditsPerUse);

      if (totalLimit) payload.total_limit = parseInt(totalLimit);
      if (dailyLimit) payload.daily_limit = parseInt(dailyLimit);
      if (expiresAt) payload.expires_at = new Date(expiresAt).toISOString();

      const { data: inserted, error } = await supabase.from("tokens").insert(payload).select().single();
      if (error) throw error;

      const url = `https://painelcreditoslovbl.lovable.app/generate/${inserted.token}`;
      setLastCreatedUrl(url);
      navigator.clipboard.writeText(url);
      toast({ title: "Token criado e URL copiada!", description: url });
      setDialogOpen(false);
      setClientName("guilherme");
      setTotalLimit("");
      setDailyLimit("5000");
      setCreditsPerUse("");
      setExpiresAt("");
      fetchTokens();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };
  const quickCreateToken = async () => {
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: inserted, error } = await supabase
        .from("tokens")
        .insert({
          client_name: "guilherme",
          daily_limit: 5000,
          credits_per_use: 1000,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      const url = `https://painelcreditoslovbl.lovable.app/generate/${inserted.token}`;
      navigator.clipboard.writeText(url);
      toast({ title: "Token rápido criado e URL copiada!", description: url });
      fetchTokens();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };
  const toggleToken = async (id: string, isActive: boolean) => {
    await supabase.from("tokens").update({ is_active: !isActive }).eq("id", id);
    fetchTokens();
  };

  const deleteToken = async (id: string) => {
    await supabase.from("tokens").delete().eq("id", id);
    fetchTokens();
    toast({ title: "Token excluído" });
  };

  const copyLink = (token: string, id: string) => {
    const url = `https://painelcreditoslovbl.lovable.app/generate/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast({ title: "URL copiada!", description: url });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getUsageInfo = (token: Token) => {
    const parts: string[] = [];
    if (token.total_limit) parts.push(`${token.total_limit} total`);
    if (token.daily_limit) parts.push(`${token.daily_limit}/dia`);
    if (!token.total_limit && !token.daily_limit) parts.push("Ilimitado");
    return parts.join(" • ");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Tokens de Acesso</h2>
          <p className="text-sm text-muted-foreground">Gerencie tokens para seus clientes</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={quickCreateToken} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Token Rápido
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={() => setLastCreatedUrl(null)}>
                <Plus className="h-4 w-4" /> Novo Token
              </Button>
            </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Criar Novo Token</DialogTitle>
            </DialogHeader>
            <form onSubmit={createToken} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Cliente *</Label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nome do cliente"
                  required
                  className="bg-secondary"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Limite Total</Label>
                  <Input
                    type="number"
                    value={totalLimit}
                    onChange={(e) => setTotalLimit(e.target.value)}
                    placeholder="Ilimitado"
                    min={1}
                    className="bg-secondary"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Limite Diário</Label>
                  <Input
                    type="number"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    placeholder="Ilimitado"
                    min={1}
                    className="bg-secondary"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Créditos por Uso (vazio = ilimitado)</Label>
                <Input
                  type="number"
                  value={creditsPerUse}
                  onChange={(e) => setCreditsPerUse(e.target.value)}
                  placeholder="Ilimitado"
                  min={5}
                  max={99999}
                  step={5}
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label>Data de Expiração</Label>
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="bg-secondary"
                />
              </div>
              <Button type="submit" className="w-full" disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Criar Token
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {tokens.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Nenhum token criado ainda.</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Novo Token" para criar o primeiro.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Limites</TableHead>
                  <TableHead>Créditos/Uso</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id} className="border-border">
                    <TableCell>
                      <div className="font-medium">{token.client_name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={`https://painelcreditoslovbl.lovable.app/generate/${token.token}`}>
                        /generate/{token.token.slice(0, 8)}...
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getUsageInfo(token)}
                    </TableCell>
                    <TableCell>{token.credits_per_use}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {token.expires_at
                        ? format(new Date(token.expires_at), "dd/MM/yyyy HH:mm")
                        : "Nunca"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={token.is_active}
                          onCheckedChange={() => toggleToken(token.id, token.is_active)}
                        />
                        <Badge variant={token.is_active ? "default" : "secondary"}>
                          {token.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyLink(token.token, token.id)}
                          title="Copiar link"
                        >
                          {copiedId === token.id ? (
                            <Check className="h-4 w-4 text-success" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(`/generate/${token.token}`, "_blank")}
                          title="Abrir link"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteToken(token.id)}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
