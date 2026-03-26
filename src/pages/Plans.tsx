import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import lovableHeart from "@/assets/lovable-heart.png";
import { PlansSection } from "@/components/public/PlansSection";

const Plans = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div
      className="min-h-screen text-foreground overflow-x-hidden bg-cover bg-center bg-fixed bg-no-repeat relative"
      style={{ backgroundImage: "url('/images/bg-landing.png')" }}
    >
      <div className="fixed inset-0 md:hidden bg-cover bg-center bg-no-repeat z-0" style={{ backgroundImage: "url('/images/bg-mobile.png')" }} />
      <div className="fixed inset-0 bg-black/60 pointer-events-none z-0" />

      <nav className="sticky top-4 z-50 mx-auto max-w-3xl px-4 relative">
        <div className="glass-card flex items-center justify-between rounded-full px-4 md:px-6 py-2.5 md:py-3">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <img src={lovableHeart} alt="Logo" className="h-6 w-6 md:h-7 md:w-7" />
            <span className="text-base md:text-lg font-bold tracking-tight">
              Lovable<span className="text-primary">Painel</span>
            </span>
          </button>
          <Button size="sm" variant="outline" className="rounded-full h-8 text-xs md:text-sm" onClick={() => navigate("/")}>
            Voltar
          </Button>
        </div>
      </nav>

      <PlansSection />

      <footer className="relative z-10 border-t border-border/40 py-8 text-center text-xs text-muted-foreground">
        <p>© 2026 LovablePainel. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};

export default Plans;
