import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Infinity,
  Zap,
  ShieldCheck,
  Cpu,
  Layers,
  Rocket,
  CheckCircle2,
  Shield,
  Clock,
  ArrowRight,
} from "lucide-react";
import lovableHeart from "@/assets/lovable-heart.png";
import { CreditsBox } from "@/components/CreditsBox";

const Landing = () => {
  const navigate = useNavigate();
  const [product, setProduct] = useState<{ id: string; price: number } | null>(null);

  useEffect(() => {
    supabase
      .from("products")
      .select("id, price")
      .eq("is_active", true)
      .order("price", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProduct(data);
      });
  }, []);

  const goToCheckout = () => {
    if (product) {
      navigate(`/checkout?product=${product.id}`);
    } else {
      navigate("/auth");
    }
  };
  return (
    <div className="min-h-screen text-foreground overflow-x-hidden bg-cover bg-center bg-fixed bg-no-repeat relative" style={{ backgroundImage: "url('/images/bg-landing.png')" }}>
      {/* Mobile-specific cosmic background */}
      <div className="fixed inset-0 md:hidden bg-cover bg-center bg-no-repeat z-0" style={{ backgroundImage: "url('/images/bg-mobile.png')" }} />
      {/* Dark overlay for text contrast */}
      <div className="fixed inset-0 bg-black/60 md:bg-black/60 pointer-events-none z-0" />
      {/* Navbar */}
      <nav className="sticky top-4 z-50 mx-auto max-w-3xl px-4 relative">
        <div className="glass-card flex items-center justify-between rounded-full px-6 py-3">
          <div className="flex items-center gap-2">
            <img src={lovableHeart} alt="Logo" className="h-7 w-7" />
            <span className="text-lg font-bold tracking-tight">
              Lovable<span className="text-primary">Painel</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#beneficios" className="hover:text-foreground transition-colors">
              Benefícios
            </a>
            <a href="#como-funciona" className="hover:text-foreground transition-colors">
              Como Funciona
            </a>
            <a href="#preco" className="hover:text-foreground transition-colors">
              Preço
            </a>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => navigate("/auth")}
          >
            Acessar
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 pt-12 md:pt-20 pb-16 md:pb-24 px-4 text-center">

        <div className="mx-auto max-w-3xl space-y-4 md:space-y-6">
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-extrabold leading-tight tracking-tight">
            Painel Gerador de Créditos{" "}
            <span className="text-primary underline decoration-primary/40 underline-offset-8">
              Lovable
            </span>
          </h1>
          <p className="mx-auto max-w-xl text-base md:text-lg text-muted-foreground">
            Automatize a geração de créditos para seu workspace. Tenha controle total
            e maximize sua produtividade com nosso painel inteligente.
          </p>
          <Button
            size="lg"
            className="rounded-full text-base px-8 gap-2 mt-4"
            onClick={goToCheckout}
          >
            Começar Agora <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="relative z-10 border-y border-border/40 py-5">
        <div className="mx-auto max-w-4xl flex flex-wrap items-center justify-center gap-8 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Escrow Seguro
          </span>
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Garantia de 30 Dias
          </span>
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Ativação Instantânea
          </span>
        </div>
      </section>


      {/* Pricing Card */}
      <section id="preco" className="relative z-10 py-14 md:py-24 px-4">
        <div className="mx-auto max-w-4xl">
          <div className="glass-card rounded-2xl p-5 md:p-12 flex flex-col md:flex-row items-center gap-6 md:gap-10 relative overflow-hidden">

            <div className="flex-1 text-left space-y-4">
              <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
                <span className="h-2 w-2 rounded-full bg-primary inline-block" /> Nível Elite
              </span>
              <h2 className="text-3xl md:text-4xl font-bold">Painel Gerador de Créditos</h2>
              <ul className="space-y-3 text-muted-foreground">
                {[
                  "Geração de Tokens Automatizada",
                  "Acesso Prioritário ao Pipeline de GPU",
                  "Direitos de Implantação Comercial",
                  "Linha Direta de Suporte de Engenharia",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="glass-card rounded-xl p-8 text-center space-y-4 min-w-[260px]">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Propriedade Vitalícia
              </span>
              <div className="text-5xl font-extrabold">
                <span className="text-xl align-top mr-1">R$</span>999
              </div>
              <Button
                size="lg"
                className="w-full rounded-lg text-base gap-2"
                onClick={goToCheckout}
              >
                Inicializar Acesso <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Limitado a 500 Licenças
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="beneficios" className="relative z-10 py-14 md:py-24 px-4">
        <div className="mx-auto max-w-5xl text-center space-y-3 md:space-y-4 mb-10 md:mb-16">
          <h2 className="text-3xl md:text-5xl font-bold">Benefícios Inegáveis</h2>
          <p className="text-muted-foreground text-lg">
            Projetado para desenvolvedores que exigem mais. Muito mais.
          </p>
        </div>
        <div className="mx-auto max-w-5xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {[
            {
              icon: Infinity,
              title: "Economia Inteligente",
              desc: "Gerencie seus créditos com eficiência. Nosso sistema otimiza cada token para máximo aproveitamento.",
            },
            {
              icon: Zap,
              title: "Experiência Fluida",
              desc: "Fluxo de trabalho contínuo. Sem pausas forçadas, sem mensagens de erro de cota excedida.",
            },
            {
              icon: ShieldCheck,
              title: "Controle Total",
              desc: "Painel administrativo robusto para gerenciar suas instâncias e uso em tempo real com segurança total.",
            },
            {
              icon: Cpu,
              title: "Processamento Prioritário",
              desc: "Salte a fila. Usuários do painel infinito têm prioridade máxima na geração de código.",
            },
            {
              icon: Layers,
              title: "Múltiplos Projetos",
              desc: "Trabalhe em múltiplos apps ao mesmo tempo sem degradação de performance.",
            },
            {
              icon: Rocket,
              title: "Deploy em 1 Clique",
              desc: "Integração direta com seus provedores favoritos. Do prompt para a produção instantaneamente.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass-card rounded-xl p-6 space-y-4 text-left">
              <div className="inline-flex items-center justify-center h-11 w-11 rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section id="como-funciona" className="relative z-10 py-14 md:py-24 px-4">
        <div className="mx-auto max-w-5xl text-center space-y-3 md:space-y-4 mb-10 md:mb-16">
          <span className="inline-block rounded-full bg-primary/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            Fluxo de Trabalho
          </span>
          <h2 className="text-3xl md:text-5xl font-bold">Como Funciona o Gerador</h2>
          <p className="text-muted-foreground text-lg">
            Um processo automatizado de 5 etapas para turbinar seu workspace no Lovable com
            créditos em minutos.
          </p>
        </div>

        <div className="mx-auto max-w-3xl space-y-6 md:space-y-10 bg-black/40 rounded-2xl p-5 md:p-12 backdrop-blur-[2px]">
          {[
            {
              step: "01",
              title: "Escolha a Quantidade",
              desc: "Selecione quantos créditos você deseja gerar para o seu workspace. Nosso algoritmo balanceia a carga de bots automaticamente.",
            },
            {
              step: "02",
              title: "Convide & Sincronize",
              desc: "Convide nosso agente automatizado para o seu workspace como editor. O sistema detectará o convite automaticamente.",
            },
            {
              step: "03",
              title: "Automação Iniciada",
              desc: 'Nossos bots "slaves" começam a processar a requisição através de proxies seguros. Você verá os primeiros créditos entrarem instantaneamente.',
            },
            {
              step: "04",
              title: "Escalonamento em Massa",
              desc: "O sistema escala a geração rapidamente, injetando pacotes de créditos através de múltiplas contas de bots simultâneas.",
            },
            {
              step: "05",
              title: "Conclusão & Verificação",
              desc: "Todos os créditos são verificados e consolidados no seu workspace. Relatório completo disponível no painel admin.",
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex items-start gap-6">
              <div className="shrink-0 flex items-center justify-center h-12 w-12 rounded-xl bg-primary/15 text-primary font-bold text-sm">
                {step}
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Final */}
      <section className="relative z-10 py-14 md:py-24 px-4 text-center">
        <div className="mx-auto max-w-2xl space-y-4 md:space-y-6">
          <h2 className="text-3xl md:text-5xl font-bold">Pronto para Começar?</h2>
          <p className="text-lg text-muted-foreground">
            Junte-se a centenas de desenvolvedores que já desbloquearam o potencial máximo do
            Lovable.
          </p>
          <Button
            size="lg"
            className="rounded-full text-base px-10 gap-2"
            onClick={goToCheckout}
          >
            Começar Agora <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 py-8 text-center text-xs text-muted-foreground">
        <p>© 2026 LovablePainel. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};

export default Landing;
