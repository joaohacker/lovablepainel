import { useState } from "react";
import { Play, ChevronDown, ChevronUp } from "lucide-react";

export function TutorialFlyer({ videoSrc = "/videos/tutorial-cliente.mp4" }: { videoSrc?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-4 flex items-center justify-between gap-3 hover:border-primary/50 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Play className="h-5 w-5 text-primary fill-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground">Vídeo Tutorial</p>
            <p className="text-xs text-muted-foreground">Clique aqui e veja como usar seus créditos</p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </button>

      {open && (
        <div className="mt-3 rounded-xl overflow-hidden border border-border/50 bg-secondary/30">
          <video
            src={videoSrc}
            controls
            autoPlay
            className="w-full"
            playsInline
          />
        </div>
      )}
    </div>
  );
}
