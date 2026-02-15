import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QRCodeSVG } from "qrcode.react";
import { Copy, CheckCircle2, Loader2, Clock, AlertTriangle } from "lucide-react";
import { formatBRL } from "@/lib/pricing";

interface PixStepProps {
  pixCode: string;
  amount: number;
}

export function PixStep({ pixCode, amount }: PixStepProps) {
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(600); // 10 minutes

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isUrgent = secondsLeft <= 120;
  const isExpired = secondsLeft === 0;

  const handleCopy = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Timer */}
      <div
        className={`w-full rounded-xl px-4 py-3 flex items-center justify-center gap-3 transition-colors ${
          isExpired
            ? "bg-destructive/15 border border-destructive/30"
            : isUrgent
            ? "bg-destructive/10 border border-destructive/20 animate-pulse"
            : "bg-accent/50 border border-border"
        }`}
      >
        {isExpired ? (
          <AlertTriangle className="h-5 w-5 text-destructive" />
        ) : (
          <Clock className={`h-5 w-5 ${isUrgent ? "text-destructive" : "text-muted-foreground"}`} />
        )}
        <span
          className={`text-lg font-bold tabular-nums ${
            isExpired ? "text-destructive" : isUrgent ? "text-destructive" : "text-foreground"
          }`}
        >
          {isExpired ? "Tempo esgotado!" : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}
        </span>
        {!isExpired && (
          <span className={`text-xs ${isUrgent ? "text-destructive/80" : "text-muted-foreground"}`}>
            para pagar
          </span>
        )}
      </div>

      {/* Price */}
      <p className="text-2xl font-bold text-primary">{formatBRL(amount)}</p>

      {/* QR Code */}
      <div className="bg-white p-4 rounded-xl shadow-lg">
        <QRCodeSVG value={pixCode} size={200} />
      </div>

      {/* Copy button - prominent */}
      <Button
        onClick={handleCopy}
        size="lg"
        className="w-full gap-2 text-base font-semibold h-12"
        variant={copied ? "outline" : "default"}
      >
        {copied ? (
          <>
            <CheckCircle2 className="h-5 w-5 text-success" />
            Código Copiado!
          </>
        ) : (
          <>
            <Copy className="h-5 w-5" />
            Copiar Código PIX
          </>
        )}
      </Button>

      {/* Pix code preview */}
      <div className="w-full">
        <Input
          value={pixCode}
          readOnly
          className="text-[10px] font-mono text-muted-foreground text-center"
        />
      </div>

      {/* Waiting indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Aguardando pagamento...
      </div>
    </div>
  );
}
