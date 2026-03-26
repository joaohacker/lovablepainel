import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Anti-debug protection (mobile-safe — no debugger statement)
(function antiDebug() {
  const msgs = [
    "🤣🤣🤣 Boa sorte tentando interceptar, seu otário! 🤣🤣🤣",
    "😂 Ainda tentando? Vai dormir vai 😂",
    "🤡 Olha o hacker de DevTools kkkk 🤡",
    "💀 Desiste mano, tá perdendo tempo 💀",
    "🫵😂 Vc realmente achou que ia funcionar? 🫵😂",
    "🧠❌ Erro 404: Habilidade não encontrada",
    "🐒 Até um macaco desistiria já",
    "📎 Parece que você está tentando hackear. Precisa de ajuda? 📎",
    "🚨 IP registrado. Brincadeira. Ou não. 🚨",
    "☕ Vai tomar um café que é melhor ☕",
  ];

  let msgIdx = 0;
  const originalTitle = document.title;

  const detectDevTools = () => {
    const el = new Image();
    let devToolsOpen = false;
    Object.defineProperty(el, "id", {
      get: () => { devToolsOpen = true; return ""; },
    });
    console.debug("%c", el as any);
    return devToolsOpen;
  };

  let jumpscareTriggered = false;

  const triggerJumpscare = () => {
    if (jumpscareTriggered) return;
    jumpscareTriggered = true;

    document.body.style.overflow = "hidden";
    document.body.style.pointerEvents = "none";
    document.body.style.userSelect = "none";
    const blockAllKeys = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); };
    const blockAllMouse = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
    const blockScroll = (e: Event) => { e.preventDefault(); };
    document.addEventListener("keydown", blockAllKeys, true);
    document.addEventListener("keyup", blockAllKeys, true);
    document.addEventListener("keypress", blockAllKeys, true);
    document.addEventListener("mousedown", blockAllMouse, true);
    document.addEventListener("click", blockAllMouse, true);
    document.addEventListener("wheel", blockScroll, { capture: true, passive: false });
    document.addEventListener("touchmove", blockScroll, { capture: true, passive: false });

    document.body.classList.add("__glitch_active");
    setTimeout(() => document.body.classList.remove("__glitch_active"), 800);

    setTimeout(() => {
    const overlay = document.createElement("div");
    overlay.id = "__scare_overlay";
    Object.assign(overlay.style, {
      position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
      background: "#000", zIndex: "2147483647", display: "flex",
      alignItems: "center", justifyContent: "center", flexDirection: "column",
      cursor: "none", userSelect: "none",
    });
    overlay.style.pointerEvents = "all";
    document.body.appendChild(overlay);

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    ["/audio/blocked-token.mp3", "/audio/scare-2.mp3", "/audio/scare-3.mp3"].forEach(src => {
      try {
        const a = new Audio(src);
        a.volume = 1;
        const source = audioCtx.createMediaElementSource(a);
        const gain = audioCtx.createGain();
        gain.gain.value = 10;
        source.connect(gain);
        gain.connect(audioCtx.destination);
        a.play().catch(() => {});
      } catch {}
    });

    setTimeout(() => {
      const flash = document.createElement("div");
      Object.assign(flash.style, {
        position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
        background: "#fff", zIndex: "2147483647", opacity: "1",
        transition: "opacity 0.6s ease-out",
      });
      overlay.appendChild(flash);
      setTimeout(() => { flash.style.opacity = "0"; }, 150);
      setTimeout(() => { flash.remove(); }, 800);

      const img = document.createElement("img");
      img.src = "/images/blocked-token.png";
      Object.assign(img.style, {
        maxWidth: "80vw", maxHeight: "70vh", animation: "jumpscareZoom 0.15s ease-out forwards",
        filter: "contrast(2) brightness(1.8) saturate(1.5)",
      });
      overlay.appendChild(img);

      let bright = true;
      const strobeInterval = setInterval(() => {
        img.style.filter = bright
          ? "contrast(3) brightness(3) saturate(2)"
          : "contrast(1.5) brightness(1.2) saturate(1)";
        bright = !bright;
      }, 200);
      setTimeout(() => { clearInterval(strobeInterval); img.style.filter = "contrast(1.5) brightness(1.2)"; }, 3000);

      const txt = document.createElement("div");
      txt.textContent = "🚨 ACESSO BLOQUEADO — IP REGISTRADO 🚨";
      Object.assign(txt.style, {
        color: "#ff0000", fontSize: "clamp(18px, 4vw, 36px)", fontWeight: "900",
        textAlign: "center", marginTop: "20px", fontFamily: "monospace",
        animation: "blinkRed 0.3s infinite",
        textShadow: "0 0 20px #ff0000, 0 0 40px #ff0000",
      });
      overlay.appendChild(txt);

      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          const g = document.createElement("div");
          g.textContent = ["BREACH DETECTED", "SYSTEM COMPROMISED", "TRACING IP...", "FIREWALL ACTIVATED", "DADOS COLETADOS", "ENVIANDO PARA POLÍCIA...", "ACESSO NEGADO", "☠️ GAME OVER ☠️"][i];
          Object.assign(g.style, {
            color: `hsl(${Math.random() * 60}, 100%, 50%)`, fontSize: "14px",
            fontFamily: "monospace", opacity: "0.8",
            transform: `translateX(${(Math.random() - 0.5) * 100}px)`,
          });
          overlay.appendChild(g);
        }, i * 200);
      } 
    }, 300);

    let shakeCount = 0;
    const shakeInterval = setInterval(() => {
      document.body.style.transform = `translate(${(Math.random() - 0.5) * 20}px, ${(Math.random() - 0.5) * 20}px)`;
      shakeCount++;
      if (shakeCount > 30) {
        clearInterval(shakeInterval);
        document.body.style.transform = "";
      }
    }, 50);

    const consoleSpam = setInterval(() => {
      console.clear();
      for (let i = 0; i < 50; i++) {
        console.error("%c☠️ ACESSO BLOQUEADO ☠️", "font-size:30px;color:red;font-weight:bold;text-shadow:0 0 10px red");
        console.warn("%c" + "█".repeat(100), `color:hsl(${Math.random()*360},100%,50%);font-size:4px`);
      }
    }, 500);

    setTimeout(() => {
      clearInterval(consoleSpam);
      overlay.innerHTML = "";
      Object.assign(overlay.style, {
        background: "#0a0a0a", flexDirection: "column", gap: "20px",
      });
      const lockIcon = document.createElement("div");
      lockIcon.innerHTML = "🔒";
      lockIcon.style.fontSize = "80px";
      overlay.appendChild(lockIcon);

      const msg2 = document.createElement("div");
      msg2.innerHTML = `<div style="color:#ff3333;font-size:24px;font-weight:bold;text-align:center;font-family:monospace">DISPOSITIVO BLOQUEADO</div>
        <div style="color:#666;font-size:14px;text-align:center;margin-top:10px;font-family:monospace">Tentativa de acesso não autorizado detectada.<br>Feche o DevTools e recarregue a página.</div>`;
      overlay.appendChild(msg2);
    }, 5000);

    let titleFlicker = 0;
    setInterval(() => {
      document.title = titleFlicker % 2 === 0 ? "⚠️ BLOQUEADO" : "☠️ IP REGISTRADO";
      titleFlicker++;
    }, 500);
    }, 800);
  };

  const style = document.createElement("style");
  style.textContent = `
    @keyframes jumpscareZoom { from { transform: scale(5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes blinkRed { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
    @keyframes glitchShift {
      0% { transform: translate(0); filter: hue-rotate(0deg); }
      20% { transform: translate(-5px, 3px); filter: hue-rotate(90deg) saturate(3); }
      40% { transform: translate(5px, -3px) skewX(5deg); filter: hue-rotate(180deg) contrast(2); }
      60% { transform: translate(-3px, -5px) skewY(-3deg); filter: hue-rotate(270deg) invert(0.3); }
      80% { transform: translate(3px, 5px) skewX(-5deg); filter: hue-rotate(360deg) saturate(5); }
      100% { transform: translate(0); filter: hue-rotate(0deg); }
    }
    .__glitch_active {
      animation: glitchShift 0.1s infinite !important;
    }
    .__glitch_active * {
      animation: glitchShift 0.08s infinite reverse !important;
    }
  `;
  document.head.appendChild(style);

  setInterval(() => {
    try {
      if (detectDevTools()) {
        triggerJumpscare();
        console.clear();
        const msg = msgs[msgIdx % msgs.length];
        msgIdx++;
        console.log(
          `%c${msg}`,
          "font-size: 22px; color: #ffd43b; font-weight: bold; background: #1a1a2e; padding: 10px; border-radius: 8px;"
        );
        for (let i = 0; i < 20; i++) {
          console.log(
            "%c" + btoa(Math.random().toString()).repeat(3),
            "color: #333; font-size: 8px;"
          );
        }
        document.title = msgIdx % 2 === 0 ? "🤡 HACKER DETECTADO 🤡" : "😂 DESISTE 😂";
      } else {
        if (document.title !== originalTitle) {
          document.title = originalTitle;
        }
        if (!jumpscareTriggered) return;
      }
    } catch {}
  }, 2000);

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
      (e.ctrlKey && e.key === "u")
    ) {
      e.preventDefault();
      triggerJumpscare();
    }
  });
})();

console.clear();
console.log(
  "%c🤣🤣🤣 Boa sorte tentando interceptar, seu otário! 🤣🤣🤣",
  "font-size: 18px; color: #ffd43b; font-weight: bold; background: #1a1a2e; padding: 8px 12px; border-radius: 6px;"
);

// --- Honeypot: fake "leaked" credentials planted to waste attacker time ---
(function() {
  // @ts-ignore
  (window as any).__DEBUG_CONFIG = {
    _api_endpoint: "https://api-prod.cloudservicex.net/v2",
    _admin_token: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4iLCJ1aWQiOiJhZG1pbi0wMDEiLCJleHAiOjE3OTk5OTk5OTl9.dGhpc19pc19hX2Zha2VfdG9rZW5fZG9udF93YXN0ZV90aW1l",
    _farm_key: "sk_live_f4k3_9a8b7c6d5e4f3g2h1i0j_prod",
    _master_key: "mk_prod_x7k9m2p4q8r1t5w3y6z0_v2",
    _db_url: "postgresql://admin:S3cur3P@ss!2024@db-node-01.cloudservicex.net:5432/credits_prod",
    _redis: "redis://:r3d1s_s3cr3t@cache.cloudservicex.net:6379/0",
    _webhook_secret: "whsec_f4k3s3cr3tk3y_n0tr34l_d0ntb0th3r",
    _stripe_sk: "sk_live_51N0tR34lK3y_f4k3str1p3k3y000000000000",
    _aws_access: "AKIAIOSFODNN7FAKE001",
    _aws_secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYFAKESECRET",
    _s3_bucket: "s3://app-credits-backup-prod/exports/",
    _slack_webhook: "https://hooks.slack.com/services/T0FAKE01/B0FAKE02/xyzFakeWebhookToken123",
  };

  // @ts-ignore
  (window as any).__ADMIN_BYPASS = function(credits: number) {
    console.info(`[bypass] Requesting ${credits} credits override...`);
    return fetch("https://api-prod.cloudservicex.net/v2/admin/credits/override", {
      method: "POST",
      headers: { "Authorization": "Bearer " + (window as any).__DEBUG_CONFIG._admin_token },
      body: JSON.stringify({ credits, bypass: true })
    }).then(() => console.info("[bypass] Override applied."))
      .catch(() => console.error("[bypass] Failed - check VPN connection"));
  };

  try {
    localStorage.setItem("__dev_session", JSON.stringify({
      uid: "admin-001",
      role: "superadmin",
      api_key: "sk_live_f4k3_BACKUP_k3y_0ld_d0ntus3",
      refresh_token: "rt_f4k3_r3fr3sh_t0k3n_pr0d_2024",
      last_login: new Date().toISOString(),
      permissions: ["credits.override", "tokens.unlimited", "users.manage", "farm.bypass_queue"],
    }));
  } catch {}

  document.cookie = "admin_session=eyJhZG1pbiI6dHJ1ZSwidWlkIjoiYWRtaW4tMDAxIn0=; path=/; SameSite=Lax";
  document.cookie = "api_token=sk_f4k3_c00k13_t0k3n_pr0d; path=/api; SameSite=Lax";

  setTimeout(() => {
    console.warn("[config] WARNING: Running with debug keys. Set NODE_ENV=production to disable.");
  }, 3000 + Math.random() * 2000);

  setTimeout(() => {
    console.info("[auth] admin session restored from cache | uid=admin-001 | role=superadmin");
  }, 5000 + Math.random() * 3000);

  setTimeout(() => {
    console.debug("[router] Mapped internal routes: /v2/admin/users, /v2/admin/credits/override, /v2/admin/tokens/generate-unlimited");
  }, 8000 + Math.random() * 2000);

  setTimeout(() => {
    console.info("[db] Connected to db-node-01.cloudservicex.net:5432 | pool_size=10 | ssl=require");
  }, 10000 + Math.random() * 3000);

  setTimeout(() => {
    console.debug("[cache] Redis connected @ cache.cloudservicex.net:6379 | db=0 | keys_loaded=4821");
  }, 12000 + Math.random() * 2000);

  setTimeout(() => {
    console.info("[flags] Feature flags loaded: { unlimited_credits: false, admin_bypass: true, debug_mode: true, rate_limit_disabled: false }");
  }, 14000 + Math.random() * 3000);

  setTimeout(() => {
    console.warn("[security] API key rotation overdue by 47 days. Last rotated: 2025-12-25. Run /v2/admin/rotate-keys to update.");
  }, 18000 + Math.random() * 5000);

  setTimeout(() => {
    console.error("[farm-worker] Connection to worker-03.internal refused. Falling back to master node. Retry token: rtk_m4st3r_f4llb4ck_2024");
  }, 22000 + Math.random() * 5000);

  setTimeout(() => {
    console.warn("[env] Loaded .env.production: { API_URL: 'https://api-prod.cloudservicex.net', ADMIN_EMAIL: 'admin@cloudservicex.net', SUPPORT_KEY: 'spk_l1v3_supp0rt_k3y_2024', BILLING_WEBHOOK: '/v2/webhooks/stripe' }");
  }, 28000 + Math.random() * 5000);

  setTimeout(() => {
    console.debug("[graphql] Introspection enabled at /v2/graphql?token=introspect_t0k3n_d3v. Schema: credits { override(amount: Int!, bypass: Boolean): Result }");
  }, 35000 + Math.random() * 5000);

  const comment1 = document.createComment(" TODO: remove before deploy - admin endpoint: https://api-prod.cloudservicex.net/v2/admin ");
  const comment2 = document.createComment(" FIXME: hardcoded API key for testing: sk_test_f4k3_h4rdc0d3d_k3y_2024 ");
  const comment3 = document.createComment(" DEBUG: override credits at /v2/admin/credits/set?key=mk_prod_x7k9m2p4q8r1t5w3y6z0_v2&amount=99999 ");
  document.head.appendChild(comment1);
  document.body.appendChild(comment2);
  document.body.appendChild(comment3);
})();

createRoot(document.getElementById("root")!).render(<App />);
