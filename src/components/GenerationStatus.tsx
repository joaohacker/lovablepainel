import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Copy,
  Check,
  Clock,
  Loader2,
  XCircle,
  AlertTriangle,
  PartyPopper,
  Ban,
  RefreshCw,
} from "lucide-react";
import type { FarmState } from "@/hooks/useFarmGeneration";
import type { FarmStatus } from "@/lib/farm-api";

interface GenerationStatusProps {
  state: FarmState;
  masterEmail: string | null;
  queuePosition: number | null;
  workspaceName: string | null;
  creditsEarned: number;
  totalCreditsRequested: number;
  result: FarmStatus["result"] | null;
  errorMessage: string | null;
  logs: string[];
  expiresAt: number | null;
  onCancel: () => void;
  onReset: () => void;
}

function CountdownTimer({ expiresAt }: { expiresAt: number }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, expiresAt - Date.now());
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Clock className="h-4 w-4" />
      <span className="font-mono text-lg">{timeLeft}</span>
    </div>
  );
}

export function GenerationStatus({
  state,
  masterEmail,
  queuePosition,
  workspaceName,
  creditsEarned,
  totalCreditsRequested,
  result,
  errorMessage,
  logs,
  expiresAt,
  onCancel,
  onReset,
}: GenerationStatusProps) {
  const [copied, setCopied] = useState(false);

  const copyEmail = useCallback(async () => {
    if (!masterEmail) return;
    await navigator.clipboard.writeText(masterEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [masterEmail]);

  const progressPercent =
    totalCreditsRequested > 0 ? Math.min(100, (creditsEarned / totalCreditsRequested) * 100) : 0;

  // Creating
  if (state === "creating") {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">Criando sessão...</p>
      </div>
    );
  }

  // Queued
  if (state === "queued") {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-xl font-semibold">Na Fila</p>
        {queuePosition && (
          <p className="text-muted-foreground">
            Posição <span className="font-bold text-primary">{queuePosition}</span> — aguarde...
          </p>
        )}
        <Button variant="outline" onClick={onCancel} className="mt-4">
          <XCircle className="h-4 w-4 mr-2" /> Cancelar
        </Button>
      </div>
    );
  }

  // Waiting invite
  if (state === "waiting_invite") {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Convide este email no seu workspace Lovable
        </p>

        <Card className="glass-card w-full">
          <CardContent className="p-6 flex flex-col items-center gap-4">
            <p className="text-xl md:text-2xl font-mono font-bold text-primary break-all text-center select-all">
              {masterEmail}
            </p>
            <Button
              onClick={copyEmail}
              variant={copied ? "default" : "outline"}
              className={`gap-2 transition-all ${copied ? "bg-success hover:bg-success/90 text-success-foreground" : ""}`}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copiar Email
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {expiresAt && <CountdownTimer expiresAt={expiresAt} />}

        <p className="text-sm text-muted-foreground text-center max-w-md">
          Vá até o Lovable, abra seu workspace e convide o email acima como membro. O sistema detectará automaticamente.
        </p>

        <Button variant="outline" onClick={onCancel} className="mt-2">
          <XCircle className="h-4 w-4 mr-2" /> Cancelar
        </Button>
      </div>
    );
  }

  // Running
  if (state === "running") {
    return (
      <div className="flex flex-col gap-6 py-8">
        {workspaceName && (
          <p className="text-center text-sm text-muted-foreground">
            Workspace: <span className="font-semibold text-foreground">{workspaceName}</span>
          </p>
        )}

        <div className="text-center">
          <p className="text-5xl font-bold text-success animate-count-up">
            {creditsEarned}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            de {totalCreditsRequested} créditos
          </p>
        </div>

        <Progress value={progressPercent} className="h-3" />

        <Card className="glass-card max-h-40 overflow-y-auto">
          <CardContent className="p-4">
            <div className="space-y-1 text-xs font-mono text-muted-foreground">
              {logs.slice(-10).map((log, i) => (
                <p key={i} className={log.startsWith("+5") ? "text-success font-semibold" : ""}>
                  {log}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Completed
  if (state === "completed") {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <PartyPopper className="h-16 w-16 text-success" />
        <div className="text-center">
          <p className="text-4xl font-bold text-success">
            {result?.credits ?? creditsEarned}
          </p>
          <p className="text-lg text-muted-foreground mt-1">créditos gerados com sucesso!</p>
        </div>

        {result && (
          <div className="flex gap-6 text-sm text-muted-foreground">
            <span>Tentados: {result.attempted}</span>
            <span>Falhas: {result.failed}</span>
          </div>
        )}

        <Button onClick={onReset} size="lg" className="gap-2 mt-4">
          <RefreshCw className="h-4 w-4" /> Gerar Novamente
        </Button>
      </div>
    );
  }

  // Error
  if (state === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-semibold">Erro</p>
        <p className="text-muted-foreground text-center">{errorMessage}</p>
        <Button onClick={onReset} variant="outline" className="mt-4 gap-2">
          <RefreshCw className="h-4 w-4" /> Tentar Novamente
        </Button>
      </div>
    );
  }

  // Expired
  if (state === "expired") {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Clock className="h-12 w-12 text-destructive" />
        <p className="text-lg font-semibold">Tempo Esgotado</p>
        <p className="text-muted-foreground text-center">
          O convite não foi detectado em 10 minutos.
        </p>
        <Button onClick={onReset} variant="outline" className="mt-4 gap-2">
          <RefreshCw className="h-4 w-4" /> Tentar Novamente
        </Button>
      </div>
    );
  }

  // Cancelled
  if (state === "cancelled") {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Ban className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-semibold">Geração Cancelada</p>
        <Button onClick={onReset} variant="outline" className="mt-4 gap-2">
          <RefreshCw className="h-4 w-4" /> Gerar Novamente
        </Button>
      </div>
    );
  }

  return null;
}
