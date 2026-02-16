import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Target, Crown, Gem } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
  daily_limit: number | null;
  credits_per_use: number;
  description: string | null;
}

const PLAN_META: Record<string, { icon: typeof Target; popular?: boolean }> = {
  "Básico": { icon: Target },
  "Pro": { icon: Crown, popular: true },
  "Premium": { icon: Gem },
};

export function PlansSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("products")
      .select("id, name, price, daily_limit, credits_per_use, description")
      .in("name", ["Básico", "Pro", "Premium"])
      .in("price", [49.99, 99, 199])
      .eq("is_active", true)
      .order("price")
      .then(({ data }) => {
        if (data) setProducts(data);
      });
  }, []);

  if (!products.length) return null;

  return (
    <section id="planos" className="relative z-10 py-14 md:py-24 px-4">
      <div className="mx-auto max-w-5xl text-center space-y-3 md:space-y-4 mb-8 md:mb-16">
        <span className="inline-block rounded-full bg-primary/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
          Licenças
        </span>
        <h2 className="text-2xl md:text-5xl font-bold">Planos de Licença</h2>
        <p className="text-muted-foreground text-sm md:text-lg max-w-xl mx-auto">
          Pagamento único, token permanente. Sem mensalidade, sem surpresas.
        </p>
      </div>

      <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
        {products.map((p) => {
          const meta = PLAN_META[p.name] ?? { icon: Target };
          const Icon = meta.icon;
          const isPopular = meta.popular;

          return (
            <div
              key={p.id}
              className={`glass-card rounded-2xl p-6 md:p-8 flex flex-col relative transition-transform hover:scale-[1.02] ${
                isPopular ? "ring-2 ring-primary md:scale-105" : ""
              }`}
            >
              {isPopular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1">
                  Mais Popular
                </Badge>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-xl font-bold">{p.name}</h3>
              </div>

              <div className="mb-6">
                <span className="text-3xl md:text-4xl font-extrabold">
                  R$ {p.price.toFixed(2).replace(".", ",")}
                </span>
                <span className="text-muted-foreground text-sm ml-2">único</span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>{p.daily_limit?.toLocaleString("pt-BR")} créditos/dia</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>Token permanente</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>Sem mensalidade</span>
                </li>
              </ul>

              <Button
                className="w-full rounded-full"
                size="lg"
                variant={isPopular ? "default" : "outline"}
                onClick={() => navigate(`/checkout?product=${p.id}`)}
              >
                Assinar {p.name}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
