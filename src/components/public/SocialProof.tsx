import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Play, Pause, Users, TrendingUp, Star, Loader2 } from "lucide-react";

interface ProofSlide {
  thumbnail?: string;
  type: "image" | "video";
  src: string;
  caption: string;
}

const SLIDES: ProofSlide[] = [
  { type: "image", src: "/images/proof/proof-3.jpeg", caption: "\"Chegou 900 já\" — 900 créditos gerados" },
  { type: "video", src: "/images/proof/proof-video-1.mp4", caption: "Geração ao vivo — créditos subindo em tempo real" },
  { type: "image", src: "/images/proof/proof-2.jpeg", caption: "\"Não durou 20 segundos\" — 200 créditos em instantes" },
  { type: "image", src: "/images/proof/proof-1.jpeg", caption: "500 créditos gerados — 500/500 completo" },
  { type: "video", src: "/images/proof/proof-video-2.mp4", caption: "Vídeo: processo completo de geração" },
  { type: "image", src: "/images/proof/proof-4.jpeg", caption: "\"Top de mais\" — cliente satisfeito" },
  { type: "image", src: "/images/proof/proof-6.jpeg", caption: "\"Cara, foi muito rapido\" — 11.535 créditos" },
  { type: "image", src: "/images/proof/proof-5.jpeg", caption: "\"Creditou certinho\" — 900 créditos com sucesso" },
  { type: "image", src: "/images/proof/proof-8.jpeg", caption: "\"Parabens!!!\" — feedback real de cliente" },
];

const STATS = [
  { icon: TrendingUp, value: "3.200.000+", label: "Créditos gerados" },
  { icon: Users, value: "350+", label: "Usuários ativos" },
  { icon: Star, value: "4.9/5", label: "Satisfação" },
];

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[260px] sm:w-[280px] md:w-[300px]">
      {/* Phone body */}
      <div className="relative rounded-[2.5rem] border-[3px] border-white/10 bg-black/80 p-2 shadow-2xl shadow-violet-950/30">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-b-2xl z-20" />
        {/* Screen */}
        <div className="relative rounded-[2rem] overflow-hidden bg-black aspect-[9/19.5]">
          {children}
        </div>
        {/* Home indicator */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-24 h-1 rounded-full bg-white/20" />
      </div>
    </div>
  );
}

function VideoSlide({ src, isActive }: { src: string; isActive: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Show first frame by seeking to 0.1s once metadata loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleLoaded = () => {
      video.currentTime = 0.1;
    };
    const handleSeeked = () => {
      setLoaded(true);
    };
    video.addEventListener("loadeddata", handleLoaded);
    video.addEventListener("seeked", handleSeeked);
    return () => {
      video.removeEventListener("loadeddata", handleLoaded);
      video.removeEventListener("seeked", handleSeeked);
    };
  }, [src]);

  // Pause when navigating away
  useEffect(() => {
    if (!isActive && playing && videoRef.current) {
      videoRef.current.pause();
      setPlaying(false);
    }
  }, [isActive, playing]);

  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div className="relative w-full h-full cursor-pointer" onClick={toggle}>
      {/* Loading spinner while video hasn't loaded */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-30">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
      )}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover"
        loop
        muted
        playsInline
        preload="auto"
        onEnded={() => setPlaying(false)}
      />
      {!playing && loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-20">
          <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Play className="h-7 w-7 text-white ml-1" fill="white" />
          </div>
        </div>
      )}
    </div>
  );
}

function ImageSlide({ src, alt, isActive }: { src: string; alt: string; isActive: boolean }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative w-full h-full">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

export function SocialProof() {
  const [current, setCurrent] = useState(0);
  const total = SLIDES.length;

  // Preload adjacent images for smooth transitions
  useEffect(() => {
    const toPreload = [
      (current + 1) % total,
      (current - 1 + total) % total,
      (current + 2) % total,
    ];
    toPreload.forEach((i) => {
      const s = SLIDES[i];
      if (s.type === "image") {
        const img = new Image();
        img.src = s.src;
      }
    });
  }, [current, total]);

  const prev = () => setCurrent((c) => (c - 1 + total) % total);
  const next = () => setCurrent((c) => (c + 1) % total);

  const slide = SLIDES[current];

  return (
    <section className="relative z-10 py-14 md:py-24 px-4">
      <div className="mx-auto max-w-5xl">
        {/* Stats counters */}
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 mb-10 md:mb-14">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-emerald-400" />
                <span className="text-2xl md:text-4xl font-black text-white">{value}</span>
              </div>
              <span className="text-xs md:text-sm text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        {/* Section title */}
        <div className="text-center space-y-3 mb-8 md:mb-12">
          <span className="inline-block rounded-full bg-emerald-500/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-400">
            Prova Social
          </span>
          <h2 className="text-2xl md:text-5xl font-bold">Resultados Reais de Clientes</h2>
          <p className="text-muted-foreground text-sm md:text-lg max-w-lg mx-auto">
            Prints e vídeos reais de clientes usando o painel. Sem edição, sem filtro.
          </p>
        </div>

        {/* Carousel with phone frame */}
        <div className="flex items-center justify-center gap-4 md:gap-8">
          {/* Prev button */}
          <button
            onClick={prev}
            className="shrink-0 h-10 w-10 md:h-12 md:w-12 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm flex items-center justify-center hover:bg-white/10 transition-colors"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>

          {/* Phone */}
          <div className="flex flex-col items-center gap-4">
            <PhoneFrame>
              {slide.type === "image" ? (
                <ImageSlide src={slide.src} alt={slide.caption} isActive={true} />
              ) : (
                <VideoSlide src={slide.src} isActive={true} />
              )}
            </PhoneFrame>

            {/* Caption */}
            <p className="text-xs md:text-sm text-muted-foreground text-center max-w-[280px] leading-relaxed">
              {slide.caption}
            </p>

            {/* Dots */}
            <div className="flex items-center gap-1.5">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === current
                      ? "w-6 bg-emerald-400"
                      : "w-1.5 bg-white/20 hover:bg-white/40"
                  }`}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Next button */}
          <button
            onClick={next}
            className="shrink-0 h-10 w-10 md:h-12 md:w-12 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm flex items-center justify-center hover:bg-white/10 transition-colors"
            aria-label="Próximo"
          >
            <ChevronRight className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>
    </section>
  );
}
