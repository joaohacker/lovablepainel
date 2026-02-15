import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  Copy,
  CheckCircle2,
  Loader2,
  Clock,
  ShieldCheck,
} from "lucide-react";
import lovableHeart from "@/assets/lovable-heart.png";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  credits_per_use: number;
  total_limit: number | null;
  daily_limit: number | null;
}

type CheckoutStep = "form" | "pix" | "success";

const Checkout = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const productId = searchParams.get("product");

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<CheckoutStep>("form");
  const [copied, setCopied] = useState(false);

  // Form
  const [email, setEmail] = useState("");

  // PIX data
  const [pixCode, setPixCode] = useState("");
  const [orderId, setOrderId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [tokenValue, setTokenValue] = useState("");

  // Polling for payment
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!productId) {
      navigate("/");
      return;
    }
    loadProduct();
  }, [productId]);

  // Poll for payment confirmation
  useEffect(() => {
    if (step !== "pix" || !orderId) return;

    setPolling(true);
    const interval = setInterval(async () => {
      const { data: order } = await supabase
        .from("orders")
        .select("status, token_id")
        .eq("id", orderId)
        .single();

      if (order?.status === "paid" && order.token_id) {
        // Get token value
        const { data: token } = await supabase
          .from("tokens")
          .select("token")
          .eq("id", order.token_id)
          .single();

        if (token) {
          setTokenValue(token.token);
        }
        setStep("success");
        setPolling(false);
        clearInterval(interval);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      setPolling(false);
    };
  }, [step, orderId]);

  const loadProduct = async () => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId!)
      .eq("is_active", true)
      .single();

    setProduct(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;

    setSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/brpix-payment`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          product_id: product.id,
          email,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao criar pagamento");
      }

      setPixCode(data.pix_code || "");
      setOrderId(data.order_id);
      setTransactionId(data.transaction_id);
      setExpiresAt(data.expires_at || "");
      setStep("pix");
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar pagamento");
    } finally {
      setSubmitting(false);
    }
  };

  const copyPixCode = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    toast.success("Código PIX copiado!");
    setTimeout(() => setCopied(false), 3000);
  };

  const copyTokenLink = () => {
    const link = `${window.location.origin}/generate/${tokenValue}`;
    navigator.clipboard.writeText(link);
    toast.success("Link de acesso copiado!");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center px-4">
        <h1 className="text-2xl font-bold">Produto não encontrado</h1>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <nav className="sticky top-4 z-50 mx-auto max-w-3xl px-4">
        <div className="glass-card flex items-center justify-between rounded-full px-6 py-3">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <img src={lovableHeart} alt="Logo" className="h-7 w-7" />
            <span className="text-lg font-bold tracking-tight">
              Lovable<span className="text-primary">Infinite</span>
            </span>
          </div>
          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-lg px-4 pt-16 pb-24">
        {/* Step: Form */}
        {step === "form" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold">Finalizar Compra</h1>
              <p className="text-muted-foreground">
                {product.name} — <span className="text-primary font-semibold">R$ {Number(product.price).toFixed(2)}</span>
              </p>
            </div>

            <div className="glass-card rounded-xl p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="pt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Pagamento seguro via PIX
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={submitting || !email}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando PIX...
                    </>
                  ) : (
                    `Pagar R$ ${Number(product.price).toFixed(2)}`
                  )}
                </Button>
              </form>
            </div>
          </div>
        )}

        {/* Step: PIX QR Code */}
        {step === "pix" && (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">Pague com PIX</h1>
              <p className="text-muted-foreground">
                Escaneie o QR Code ou copie o código para pagar
              </p>
            </div>

            <div className="glass-card rounded-xl p-8 space-y-6">
              {pixCode && (
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-xl">
                    <QRCodeSVG value={pixCode} size={220} />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">PIX Copia e Cola:</p>
                <div className="relative">
                  <Input
                    readOnly
                    value={pixCode}
                    className="pr-12 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={copyPixCode}
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Aguardando confirmação do pagamento...
              </div>

              {expiresAt && (
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Expira em {new Date(expiresAt).toLocaleTimeString("pt-BR")}
                </div>
              )}

              <p className="text-2xl font-bold text-primary">
                R$ {Number(product.price).toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === "success" && (
          <div className="space-y-6 text-center">
            <div className="space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <h1 className="text-3xl font-bold">Pagamento Confirmado!</h1>
              <p className="text-muted-foreground">
                Seu acesso foi criado com sucesso
              </p>
            </div>

            <div className="glass-card rounded-xl p-6 space-y-4">
              <p className="text-sm text-muted-foreground">Seu link de acesso:</p>
              <div className="relative">
                <Input
                  readOnly
                  value={`${window.location.origin}/generate/${tokenValue}`}
                  className="pr-12 text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={copyTokenLink}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Guarde este link! Ele também foi enviado para <strong>{email}</strong>
              </p>
            </div>

            <Button
              size="lg"
              className="rounded-full px-8"
              onClick={() => navigate(`/generate/${tokenValue}`)}
            >
              Acessar Painel de Geração
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Checkout;
