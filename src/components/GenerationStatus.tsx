import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Copy,
  Check,
  Clock,
  AlertCircle,
  Loader2,
  XCircle,
  AlertTriangle,
  PartyPopper,
  Ban,
  RefreshCw,
  Bot,
  Info,
} from "lucide-react";
import lovableHeart from "@/assets/lovable-heart.png";
import type { FarmState, FeedEntry } from "@/hooks/useFarmGeneration";
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
  feed: FeedEntry[];
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

function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value === prevValue.current) return;
    const start = prevValue.current;
    const diff = value - start;
    const duration = 400;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
    prevValue.current = value;
  }, [value]);

  return <span className={className}>{display}</span>;
}

function RunningCreditsDisplay({ feed, totalCreditsRequested }: { feed: FeedEntry[]; totalCreditsRequested: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  // Count credits only from visible (arrived) entries
  const visibleCredits = feed
    .filter((e) => e.kind === "credit" && (!e.arrivedAt || e.arrivedAt <= now))
    .reduce((sum, e) => sum + (e.credits || 0), 0);

  const progressPercent = totalCreditsRequested > 0
    ? Math.min(100, (visibleCredits / totalCreditsRequested) * 100)
    : 0;

  return (
    <>
      <div className="text-center">
        <div className="relative inline-block">
          <AnimatedCounter
            value={visibleCredits}
            className="text-6xl font-extrabold text-success tabular-nums"
          />
          <div className="absolute -inset-4 bg-success/5 rounded-full blur-2xl -z-10 animate-pulse-glow" />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          de {totalCreditsRequested} créditos
        </p>
      </div>
      <div className="space-y-1.5">
        <Progress value={progressPercent} className="h-3 bg-muted" />
        <p className="text-xs text-center text-muted-foreground font-mono">
          {visibleCredits}/{totalCreditsRequested} créditos
        </p>
      </div>
    </>
  );
}

function ActivityFeed({ feed }: { feed: FeedEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  // Tick every 100ms to reveal staggered entries smoothly
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [feed.length]);

  // Only show entries whose arrivedAt has passed (drip effect)
  const visible = feed.filter((e) => !e.arrivedAt || e.arrivedAt <= now);

  // Show newest first
  const reversed = [...visible].reverse();

  return (
    <div ref={scrollRef} className="max-h-48 overflow-y-auto space-y-1 pr-1">
      {reversed.map((entry) => (
        <div
          key={entry.id}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono animate-fade-in ${
            entry.kind === "credit"
              ? "bg-success/10 text-success"
              : entry.kind === "warning"
              ? "bg-destructive/10 text-destructive"
              : entry.kind === "success"
              ? "bg-success/15 text-success font-semibold"
              : "bg-muted/50 text-muted-foreground"
          }`}
        >
          {entry.kind === "credit" ? (
            <>
              <img src={lovableHeart} alt="" className="h-3.5 w-3.5 shrink-0" />
              <span className="font-bold">+{entry.credits}</span>
              <span className="truncate">{entry.botName}</span>
            </>
          ) : entry.kind === "warning" ? (
            <>
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="truncate">{entry.message}</span>
            </>
          ) : (
            <>
              <Info className="h-3 w-3 shrink-0" />
              <span className="truncate">{entry.message}</span>
            </>
          )}
        </div>
      ))}
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
  feed,
  expiresAt,
  onCancel,
  onReset,
}: GenerationStatusProps) {
  // Prevent closing page during active generation
  const isActive = ["creating", "queued", "waiting_invite", "running"].includes(state);
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isActive]);
  const [copied, setCopied] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const copyEmail = useCallback(async () => {
    if (!masterEmail) return;
    await navigator.clipboard.writeText(masterEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [masterEmail]);

  const copyClientMessage = useCallback(async () => {
    if (!masterEmail) return;
    const msg = `✅ Obrigado pela compra!

Para receber seus créditos na Lovable, convide o bot abaixo como EDITOR na sua workspace:

📩 ${masterEmail}

Faça o convite por aqui:
🔗 https://lovable.dev/settings?tab=people

Após enviar o convite, aguarde que os créditos serão depositados automaticamente.

⚠️ Importante:
• Convide em até 10 minutos (depois o bot expira).
• Sua workspace não pode ter mais de 5 membros no momento do convite.

Se tiver qualquer dúvida, me chama.`;
    await navigator.clipboard.writeText(msg);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2000);
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
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <Button
                onClick={copyEmail}
                variant={copied ? "default" : "outline"}
                className={`gap-2 transition-all flex-1 ${copied ? "bg-success hover:bg-success/90 text-success-foreground" : ""}`}
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
              <Button
                onClick={copyClientMessage}
                variant={copiedMsg ? "default" : "outline"}
                className={`gap-2 transition-all flex-1 ${copiedMsg ? "bg-success hover:bg-success/90 text-success-foreground" : ""}`}
              >
                {copiedMsg ? (
                  <>
                    <Check className="h-4 w-4" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Mensagem p/ Cliente
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {expiresAt && <CountdownTimer expiresAt={expiresAt} />}

        <p className="text-sm text-muted-foreground text-center max-w-md">
          Vá até o Lovable, abra seu workspace e convide o email acima. O sistema detectará automaticamente.
        </p>

        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/15 px-4 py-2.5 text-sm font-semibold text-yellow-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Convide como <span className="underline underline-offset-2">EDITOR</span> no workspace!</span>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-xs text-yellow-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Não feche esta página até a geração finalizar.</span>
        </div>

        <Button variant="outline" onClick={onCancel} className="mt-2">
          <XCircle className="h-4 w-4 mr-2" /> Cancelar
        </Button>
      </div>
    );
  }

  // Running
  if (state === "running") {
    return (
      <div className="flex flex-col gap-5 py-6">
        {workspaceName && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Workspace: <span className="font-semibold text-foreground">{workspaceName}</span>
            </p>
          </div>
        )}

        {/* Animated credit counter — driven by visible feed entries */}
        <RunningCreditsDisplay
          feed={feed}
          totalCreditsRequested={totalCreditsRequested}
        />

        {/* Activity feed */}
        <Card className="glass-card">
          <CardContent className="p-3">
            {feed.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Aguardando atividade...</span>
              </div>
            ) : (
              <ActivityFeed feed={feed} />
            )}
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-xs text-yellow-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Não feche esta página até a geração finalizar.</span>
        </div>
      </div>
    );
  }

  // Completed
  if (state === "completed") {
    const finalCredits = result?.credits ?? creditsEarned;
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="relative">
          <PartyPopper className="h-16 w-16 text-success" />
          <div className="absolute -inset-4 bg-success/10 rounded-full blur-2xl -z-10" />
        </div>
        <div className="text-center">
          <p className="text-5xl font-extrabold text-success tabular-nums">
            {finalCredits}
          </p>
          <p className="text-lg text-muted-foreground mt-1">créditos gerados com sucesso!</p>
        </div>

        {result && (
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <span>Tentados: {result.attempted}</span>
            <span className="text-success">Sucesso: {result.claimSuccess ?? "—"}</span>
            <span className="text-destructive">Falhas claim: {result.claimFailed ?? result.failed ?? 0}</span>
            {(result.inviteFailed ?? 0) > 0 && (
              <span className="text-destructive">Falhas convite: {result.inviteFailed}</span>
            )}
            {(result.removed ?? 0) > 0 && (
              <span>Removidos: {result.removed}</span>
            )}
          </div>
        )}

        <Progress value={100} className="h-3 w-full bg-muted [&>div]:bg-success" />

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
