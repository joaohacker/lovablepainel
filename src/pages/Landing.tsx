import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Infinity,
  Zap,
  ShieldCheck,
  Cpu,
  Layers,
  Rocket,
  Shield,
  Clock,
  ArrowRight,
} from "lucide-react";
import lovableHeart from "@/assets/lovable-heart.png";
import { useIsMobile } from "@/hooks/use-mobile";
import { PublicGenerator } from "@/components/public/PublicGenerator";

import { WhatsAppButton } from "@/components/public/WhatsAppButton";
import { BackgroundEffects } from "@/components/public/BackgroundEffects";
import { SocialProof } from "@/components/public/SocialProof";
import { ResellerRanking } from "@/components/public/ResellerRanking";

function LiteYouTube({ videoId }: { videoId: string }) {
  const [active, setActive] = useState(false);
  const [thumbUrl, setThumbUrl] = useState(`https://i.ytimg.com/vi/${videoId}/hq720.jpg`);
  const handleThumbError = () => setThumbUrl(`https://i.ytimg.com/vi/${videoId}/sddefault.jpg`);

  if (active) {
    return (
      <div className="relative w-full rounded-2xl overflow-hidden border border-border/50 shadow-2xl" style={{ paddingBottom: '56.25%' }}>
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube.com/embed/${videoId}?rel=0&autoplay=1`}
          title="Como funciona o LovablePainel"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setActive(true)}
      className="relative w-full rounded-2xl overflow-hidden border border-border/50 shadow-2xl cursor-pointer group"
      style={{ paddingBottom: '56.25%' }}
      aria-label="Reproduzir vídeo"
    >
      <img
        src={thumbUrl}
        onError={handleThumbError}
        alt="Thumbnail do vídeo"
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors flex items-center justify-center">
        <div className="h-16 w-16 md:h-20 md:w-20 rounded-full bg-red-600 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
          <svg viewBox="0 0 24 24" fill="white" className="h-8 w-8 md:h-10 md:w-10 ml-1">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </button>
  );
}

const Landing = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user, signOut } = useAuth();

  useEffect(() => {
    document.documentElement.classList.add("dark");
    // Capture ref param for tracking
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      sessionStorage.setItem("traffic_source", ref.toLowerCase());
    }
  }, []);

  return (
    <div className="min-h-screen text-foreground overflow-x-hidden bg-cover bg-center bg-fixed bg-no-repeat relative" style={{ backgroundImage: "url('/images/bg-landing.png')" }}>
      {/* Mobile-specific cosmic background */}
      <div className="fixed inset-0 md:hidden bg-cover bg-center bg-no-repeat z-0" style={{ backgroundImage: "url('/images/bg-mobile.png')" }} />
      {/* Dark overlay for text contrast */}
      <div className="fixed inset-0 bg-black/60 md:bg-black/60 pointer-events-none z-0" />
      <BackgroundEffects />
      {/* Navbar */}
      <nav className="sticky top-4 z-50 mx-auto max-w-3xl px-4 relative">
        <div className="glass-card flex items-center justify-between rounded-full px-3 md:px-6 py-2.5 md:py-3">
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <img src={lovableHeart} alt="Logo" className="h-5 w-5 md:h-7 md:w-7" />
            <span className="text-sm md:text-lg font-bold tracking-tight whitespace-nowrap">
              Lovable<span className="text-primary">Painel</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-6 text-[10px] md:text-sm text-muted-foreground ml-2">
            <a href="#ranking" className="hover:text-foreground transition-colors hidden sm:inline">
              Ranking
            </a>
            <a href="#beneficios" className="hover:text-foreground transition-colors hidden sm:inline">
              Benefícios
            </a>
            <a href="#como-funciona" className="hover:text-foreground transition-colors whitespace-nowrap hidden sm:inline">
              Como Funciona
            </a>
            <a href="https://wa.me/5521992046054" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              Contato
            </a>
            {user ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full h-7 md:h-8 text-[10px] md:text-sm px-2.5 md:px-3"
                onClick={() => signOut()}
              >
                Sair
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full h-7 md:h-8 text-[10px] md:text-sm px-2.5 md:px-3"
                onClick={() => navigate("/auth")}
              >
                Acessar
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero + Generator */}
      <section id="gerador" className="relative z-10 pt-10 md:pt-16 pb-10 md:pb-16 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="text-center space-y-3 mb-8 md:mb-10">
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold leading-tight tracking-tight">
              Gerador de Créditos{" "}
              <span className="text-primary underline decoration-primary/40 underline-offset-8">
                Lovable
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-sm md:text-lg text-muted-foreground">
              Feito para <span className="font-semibold text-foreground">revendedores de créditos</span> que querem escalar suas vendas — mas qualquer pessoa pode usar para gerar créditos próprios também.
            </p>
          </div>
          <PublicGenerator />
        </div>
      </section>

      {/* Reseller Ranking */}
      <ResellerRanking />

      {/* Trust Bar */}
      <section className="relative z-10 border-y border-border/40 py-5">
        <div className="mx-auto max-w-4xl flex flex-wrap items-center justify-center gap-8 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Pagamento PIX Seguro
          </span>
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Geração Instantânea
          </span>
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Pague por Demanda
          </span>
        </div>
      </section>

      {/* Demo Video */}
      <section className="relative z-10 py-14 md:py-24 px-4">
        <div className="mx-auto max-w-4xl text-center space-y-4 md:space-y-6">
          <h2 className="text-2xl md:text-5xl font-bold">Veja o Painel em Ação</h2>
          <p className="text-muted-foreground text-sm md:text-lg">
            Assista como é simples gerar créditos com o LovablePainel.
          </p>
          <LiteYouTube videoId="-lZ0VMWbOe8" />
        </div>
      </section>

      {/* Benefits */}
      <section id="beneficios" className="relative z-10 py-14 md:py-24 px-4">
        <div className="mx-auto max-w-5xl text-center space-y-3 md:space-y-4 mb-8 md:mb-16">
          <h2 className="text-2xl md:text-5xl font-bold">Benefícios Inegáveis</h2>
          <p className="text-muted-foreground text-sm md:text-lg hidden md:block">
            Projetado para desenvolvedores que exigem mais. Muito mais.
          </p>
        </div>
        <div className="mx-auto max-w-5xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {(() => {
            const allBenefits = [
              {
                icon: Infinity,
                title: "Pague por Demanda",
                desc: "Sem planos fixos. Pague apenas o que usar.",
                descFull: "Sem planos fixos ou compromissos mensais. Pague apenas pelo que usar, quando quiser.",
              },
              {
                icon: Zap,
                title: "Experiência Fluida",
                desc: "Sem pausas forçadas ou erros de cota.",
                descFull: "Fluxo de trabalho contínuo. Sem pausas forçadas, sem mensagens de erro de cota excedida.",
              },
              {
                icon: ShieldCheck,
                title: "Controle Total",
                desc: "Gerencie saldo e uso em tempo real.",
                descFull: "Acompanhe seu saldo e gerações em tempo real. Controle total sobre seus gastos.",
              },
              {
                icon: Cpu,
                title: "Processamento Prioritário",
                desc: "Prioridade máxima na geração de código.",
                descFull: "Salte a fila. Geração prioritária com máxima velocidade de processamento.",
              },
              {
                icon: Layers,
                title: "Múltiplos Projetos",
                desc: "Múltiplos apps sem perda de performance.",
                descFull: "Trabalhe em múltiplos apps ao mesmo tempo sem degradação de performance.",
              },
              {
                icon: Rocket,
                title: "Preço Justo",
                desc: "Quanto mais gera, mais barato fica.",
                descFull: "Sistema de preços escalonado — quanto mais créditos, menor o custo por unidade.",
              },
            ];
            return allBenefits.map(({ icon: Icon, title, desc, descFull }) => (
              <div key={title} className="glass-card rounded-xl p-4 md:p-6 flex md:flex-col items-center md:items-start gap-3 md:gap-0 md:space-y-4 text-left">
                <div className="shrink-0 inline-flex items-center justify-center h-9 w-9 md:h-11 md:w-11 rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm md:text-lg font-semibold">{title}</h3>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed mt-0.5 md:mt-2">{isMobile ? desc : descFull}</p>
                </div>
              </div>
            ));
          })()}
        </div>
      </section>



      {/* Social Proof */}
      <SocialProof />

      {/* How it Works */}
      <section id="como-funciona" className="relative z-10 py-14 md:py-24 px-4">
        <div className="mx-auto max-w-5xl text-center space-y-3 md:space-y-4 mb-8 md:mb-16">
          <span className="inline-block rounded-full bg-primary/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            Fluxo de Trabalho
          </span>
          <h2 className="text-2xl md:text-5xl font-bold">Como Funciona</h2>
          <p className="text-muted-foreground text-sm md:text-lg hidden md:block">
            Um processo simples de 4 etapas para turbinar seu workspace com créditos.
          </p>
        </div>

        <div className="mx-auto max-w-3xl space-y-5 md:space-y-10 bg-black/40 rounded-2xl p-4 md:p-12 backdrop-blur-[2px]">
          {[
            {
              step: "01",
              title: "Escolha a Quantidade",
              desc: "Selecione quantos créditos deseja.",
              descFull: "Selecione de 5 a 5.000 créditos. Quanto mais, menor o preço por crédito.",
            },
            {
              step: "02",
              title: "Pague via PIX",
              desc: "PIX instantâneo, saldo imediato.",
              descFull: "Pague via PIX e seu saldo é creditado automaticamente. Rápido e seguro.",
            },
            {
              step: "03",
              title: "Convite Automático",
              desc: "Convide o bot ao seu workspace.",
              descFull: "Convide nosso bot como editor no seu workspace Lovable. O sistema detecta automaticamente.",
            },
            {
              step: "04",
              title: "Créditos Gerados",
              desc: "Créditos aparecem no seu workspace.",
              descFull: "Os créditos são gerados e injetados no seu workspace automaticamente. Acompanhe em tempo real.",
            },
          ].map(({ step, title, desc, descFull }) => (
            <div key={step} className="flex items-start gap-4 md:gap-6">
              <div className="shrink-0 flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-xl bg-primary/15 text-primary font-bold text-xs md:text-sm">
                {step}
              </div>
              <div className="space-y-1 md:space-y-2">
                <h3 className="text-base md:text-xl font-bold">{title}</h3>
                <p className="text-xs md:text-base text-muted-foreground leading-relaxed">{isMobile ? desc : descFull}</p>
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
            Gere seus créditos agora — sem planos, sem compromissos.
          </p>
          <Button
            size="lg"
            className="rounded-full text-base px-10 gap-2"
            onClick={() => document.getElementById("gerador")?.scrollIntoView({ behavior: "smooth" })}
          >
            Gerar Créditos <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 py-8 text-center text-xs text-muted-foreground">
        <p>© 2026 LovablePainel. Todos os direitos reservados.</p>
      </footer>

      <WhatsAppButton />
    </div>
  );
};

export default Landing;
