import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === prevValue.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const start = prevValue.current;
    const diff = value - start;
    const duration = 400;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    prevValue.current = value;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return <span className={className}>{display}</span>;
}

function RunningCreditsDisplay({ feed, totalCreditsRequested, creditsEarned }: { feed: FeedEntry[]; totalCreditsRequested: number; creditsEarned: number }) {
  const [now, setNow] = useState(Date.now());
  const maxCreditsRef = useRef(0);

  useEffect(() => {
    // Slower tick for large generations to reduce re-renders
    const interval = totalCreditsRequested > 500 ? 500 : 'ontouchstart' in window ? 250 : 100;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [totalCreditsRequested]);

  // Count credits from visible (arrived) feed entries for drip effect
  const rawVisible = feed
    .filter((e) => e.kind === "credit" && (!e.arrivedAt || e.arrivedAt <= now))
    .reduce((sum, e) => sum + (e.credits || 0), 0);

  // Use the MAX of: feed-visible count, accumulated creditsEarned, and previous max
  // This ensures the counter never stalls even when feed entries are pruned (200 cap)
  const best = Math.max(rawVisible, creditsEarned);
  if (best > maxCreditsRef.current) {
    maxCreditsRef.current = best;
  }
  const visibleCredits = maxCreditsRef.current;

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
  const isLarge = feed.length > 100;

  useEffect(() => {
    // Much slower tick for large feeds to avoid jank
    const interval = isLarge ? 500 : 'ontouchstart' in window ? 250 : 100;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [isLarge]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [feed.length]);

  // Only show entries whose arrivedAt has passed, limit to last 40 visible for perf
  const reversed = useMemo(() => {
    const visible = feed.filter((e) => !e.arrivedAt || e.arrivedAt <= now);
    const sliced = visible.length > 40 ? visible.slice(-40) : visible;
    return sliced.reverse();
  }, [feed, now]);

  return (
    <div ref={scrollRef} className="max-h-48 overflow-y-auto space-y-1 pr-1 -webkit-overflow-scrolling-touch">
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

  const safeCopy = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    // Fallback for mobile browsers
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const copyEmail = useCallback(async () => {
    if (!masterEmail) return;
    const ok = await safeCopy(masterEmail);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [masterEmail, safeCopy]);

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
    const ok = await safeCopy(msg);
    if (ok) {
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    }
  }, [masterEmail, safeCopy]);

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
            {masterEmail ? (
              <p className="text-xl md:text-2xl font-mono font-bold text-primary break-all text-center select-all">
                {masterEmail}
              </p>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <p className="text-lg font-mono animate-pulse">Aguardando email do bot...</p>
              </div>
            )}
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
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={copyClientMessage}
          variant={copiedMsg ? "default" : "outline"}
          className={`gap-2 transition-all w-full ${copiedMsg ? "bg-success hover:bg-success/90 text-success-foreground" : "border-success/50 bg-success/15 text-success hover:bg-success/25"}`}
        >
          {copiedMsg ? (
            <>
              <Check className="h-4 w-4" /> Copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copiar Mensagem p/ cliente pronta
            </>
          )}
        </Button>

        {expiresAt && <CountdownTimer expiresAt={expiresAt} />}

        {/* Tutorial visual passo a passo */}
        <Card className="w-full border-border/50 bg-secondary/30">
          <CardContent className="p-4 md:p-5 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
              📋 Passo a Passo
            </p>

            <div className="space-y-3">
              {/* Step 1 */}
              <div className="flex items-start gap-3">
                <div className="shrink-0 flex items-center justify-center h-7 w-7 rounded-full bg-primary/15 text-primary text-xs font-bold">1</div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Copie o email do bot</p>
                  <p className="text-xs text-muted-foreground">Clique no botão "Copiar Email" acima para copiar o endereço.</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3">
                <div className="shrink-0 flex items-center justify-center h-7 w-7 rounded-full bg-primary/15 text-primary text-xs font-bold">2</div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Abra a página de convites</p>
                  <a
                    href="https://lovable.dev/settings?tab=people"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                  >
                    🔗 lovable.dev/settings → People
                  </a>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-3">
                <div className="shrink-0 flex items-center justify-center h-7 w-7 rounded-full bg-primary/15 text-primary text-xs font-bold">3</div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Clique em "Invite members"</p>
                  <p className="text-xs text-muted-foreground">Cole o email do bot e selecione a permissão <span className="font-bold text-yellow-300">EDITOR</span>.</p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex items-start gap-3">
                <div className="shrink-0 flex items-center justify-center h-7 w-7 rounded-full bg-primary/15 text-primary text-xs font-bold">4</div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Envie o convite e aguarde</p>
                  <p className="text-xs text-muted-foreground">O sistema detectará automaticamente e começará a gerar os créditos.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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
          creditsEarned={creditsEarned}
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

        {/* Warning when most credits failed due to invite failures (workspace likely full) */}
        {result && finalCredits < totalCreditsRequested * 0.5 && (result.inviteFailed ?? 0) > 0 && (
          <div className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left">
            <p className="text-xs font-semibold text-amber-400 mb-1">⚠️ Workspace possivelmente cheia</p>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              A maioria dos convites falhou ({result.inviteFailed} de {Math.ceil((result.attempted ?? totalCreditsRequested) / 5)}). 
              Isso geralmente acontece quando sua workspace tem <span className="font-bold text-amber-300">muitos membros</span>. 
              Remova membros extras e tente novamente.
            </p>
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
