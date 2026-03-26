import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
  Zap,
  Star,
  CreditCard,
  RefreshCw,
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
  const [email, setEmail] = useState("");
  const [pixCode, setPixCode] = useState("");
  const [orderId, setOrderId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [tokenValue, setTokenValue] = useState("");

  useEffect(() => {
    if (!productId) {
      navigate("/");
      return;
    }
    // Backend removed — no product to load
    setLoading(false);
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Backend removed
    toast.error("Backend removido");
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
      <nav className="sticky top-4 z-50 mx-auto max-w-3xl px-4">
        <div className="glass-card flex items-center justify-between rounded-full px-6 py-3">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <img src={lovableHeart} alt="Logo" className="h-7 w-7" />
            <span className="text-lg font-bold tracking-tight">
              Lovable<span className="text-primary">Painel</span>
            </span>
          </div>
          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-lg px-4 pt-16 pb-24">
        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Finalizar Compra</h1>
            <p className="text-sm text-muted-foreground">Backend removido</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
