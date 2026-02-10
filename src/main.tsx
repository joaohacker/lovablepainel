import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Anti-debug: debugger + infinite console spam + tab title trolling
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
  let trollTitle = false;
  const originalTitle = document.title;

  setInterval(() => {
    const start = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    if (performance.now() - start > 100) {
      // DevTools is open - go crazy
      console.clear();
      const msg = msgs[msgIdx % msgs.length];
      msgIdx++;
      
      // Styled message
      console.log(
        `%c${msg}`,
        "font-size: 22px; color: #ffd43b; font-weight: bold; background: #1a1a2e; padding: 10px; border-radius: 8px;"
      );
      
      // Flood with fake "errors" to confuse
      for (let i = 0; i < 20; i++) {
        console.log(
          "%c" + btoa(Math.random().toString()).repeat(3),
          "color: #333; font-size: 8px;"
        );
      }

      // Troll the tab title
      trollTitle = !trollTitle;
      document.title = trollTitle ? "🤡 HACKER DETECTADO 🤡" : "😂 DESISTE 😂";
    } else {
      // DevTools closed - restore title
      if (document.title !== originalTitle && !document.title.includes("🤡") === false) {
        document.title = originalTitle;
      }
    }
  }, 1500);

  // Disable right-click context menu
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    console.clear();
    console.log(
      "%c🤣 Botão direito? Sério? 🤣",
      "font-size: 20px; color: #ff6b6b; font-weight: bold;"
    );
  });

  // Detect F12 / Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+U
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
      (e.ctrlKey && e.key === "u")
    ) {
      e.preventDefault();
      console.clear();
      console.log(
        "%c🫵😂 Atalho bloqueado! Tenta outro kkkk 🫵😂",
        "font-size: 20px; color: #ffd43b; font-weight: bold; background: #1a1a2e; padding: 8px;"
      );
    }
  });
})();

console.clear();
console.log(
  "%c🤣🤣🤣 Boa sorte tentando interceptar, seu otário! 🤣🤣🤣",
  "font-size: 18px; color: #ffd43b; font-weight: bold; background: #1a1a2e; padding: 8px 12px; border-radius: 6px;"
);

// --- Honeypot: fake "leaked" credentials planted to waste attacker time ---
// Looks like a dev accidentally left debug config in production
(function() {
  // @ts-ignore - debug config, remove before deploy TODO
  (window as any).__DEBUG_CONFIG = {
    _api_endpoint: "https://api-internal.lovablextensao.shop/v2",
    _admin_token: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4iLCJ1aWQiOiJhZG1pbi0wMDEiLCJleHAiOjE3OTk5OTk5OTl9.dGhpc19pc19hX2Zha2VfdG9rZW5fZG9udF93YXN0ZV90aW1l",
    _farm_key: "sk_live_f4k3_9a8b7c6d5e4f3g2h1i0j_prod",
    _master_key: "mk_prod_x7k9m2p4q8r1t5w3y6z0_v2",
    _db_url: "postgresql://admin:S3cur3P@ss!2024@db-prod-01.lovablextensao.shop:5432/credits_prod",
    _redis: "redis://:r3d1s_s3cr3t@cache.lovablextensao.shop:6379/0",
    _webhook_secret: "whsec_f4k3s3cr3tk3y_n0tr34l_d0ntb0th3r",
  };
  // Simulate a "leaked" console.warn that looks like a real mistake
  setTimeout(() => {
    console.warn("[config] WARNING: Running with debug keys. Set NODE_ENV=production to disable.");
  }, 3000 + Math.random() * 2000);
  // Another "accidental" log
  setTimeout(() => {
    console.info("[auth] admin session restored from cache | uid=admin-001 | role=superadmin");
  }, 5000 + Math.random() * 3000);
  // Fake internal API route log
  setTimeout(() => {
    console.debug("[router] Mapped internal routes: /v2/admin/users, /v2/admin/credits/override, /v2/admin/tokens/generate-unlimited");
  }, 8000 + Math.random() * 2000);
})();

createRoot(document.getElementById("root")!).render(<App />);
