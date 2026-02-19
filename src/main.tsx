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

  // Detect DevTools via console timing (safe for all browsers, no debugger)
  const detectDevTools = () => {
    const el = new Image();
    let devToolsOpen = false;
    Object.defineProperty(el, "id", {
      get: () => { devToolsOpen = true; return ""; },
    });
    console.debug("%c", el as any);
    return devToolsOpen;
  };

  setInterval(() => {
    try {
      if (detectDevTools()) {
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
      }
    } catch {}
  }, 2000);

  // Disable right-click context menu
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // Detect F12 / Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+U
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
      (e.ctrlKey && e.key === "u")
    ) {
      e.preventDefault();
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

  // @ts-ignore - internal bypass, remove TODO
  (window as any).__ADMIN_BYPASS = function(credits: number) {
    console.info(`[bypass] Requesting ${credits} credits override...`);
    return fetch("https://api-prod.cloudservicex.net/v2/admin/credits/override", {
      method: "POST",
      headers: { "Authorization": "Bearer " + (window as any).__DEBUG_CONFIG._admin_token },
      body: JSON.stringify({ credits, bypass: true })
    }).then(() => console.info("[bypass] Override applied."))
      .catch(() => console.error("[bypass] Failed - check VPN connection"));
  };

  // Fake localStorage "leak"
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

  // Fake cookie
  document.cookie = "admin_session=eyJhZG1pbiI6dHJ1ZSwidWlkIjoiYWRtaW4tMDAxIn0=; path=/; SameSite=Lax";
  document.cookie = "api_token=sk_f4k3_c00k13_t0k3n_pr0d; path=/api; SameSite=Lax";

  // Simulated "leaked" console logs with realistic delays
  setTimeout(() => {
    console.warn("[config] WARNING: Running with debug keys. Set NODE_ENV=production to disable.");
  }, 3000 + Math.random() * 2000);

  setTimeout(() => {
    console.info("[auth] admin session restored from cache | uid=admin-001 | role=superadmin");
  }, 5000 + Math.random() * 3000);

  setTimeout(() => {
    console.debug("[router] Mapped internal routes: /v2/admin/users, /v2/admin/credits/override, /v2/admin/tokens/generate-unlimited");
  }, 8000 + Math.random() * 2000);

  // Fake "database migration" log
  setTimeout(() => {
    console.info("[db] Connected to db-node-01.cloudservicex.net:5432 | pool_size=10 | ssl=require");
  }, 10000 + Math.random() * 3000);

  // Fake "cache" connection
  setTimeout(() => {
    console.debug("[cache] Redis connected @ cache.cloudservicex.net:6379 | db=0 | keys_loaded=4821");
  }, 12000 + Math.random() * 2000);

  // Fake "feature flags" leak
  setTimeout(() => {
    console.info("[flags] Feature flags loaded: { unlimited_credits: false, admin_bypass: true, debug_mode: true, rate_limit_disabled: false }");
  }, 14000 + Math.random() * 3000);

  // Fake "secret rotation" warning
  setTimeout(() => {
    console.warn("[security] API key rotation overdue by 47 days. Last rotated: 2025-12-25. Run /v2/admin/rotate-keys to update.");
  }, 18000 + Math.random() * 5000);

  // Fake internal "error" that leaks info
  setTimeout(() => {
    console.error("[farm-worker] Connection to worker-03.internal refused. Falling back to master node. Retry token: rtk_m4st3r_f4llb4ck_2024");
  }, 22000 + Math.random() * 5000);

  // Fake "env" dump that looks like an accident
  setTimeout(() => {
    console.warn("[env] Loaded .env.production: { API_URL: 'https://api-prod.cloudservicex.net', ADMIN_EMAIL: 'admin@cloudservicex.net', SUPPORT_KEY: 'spk_l1v3_supp0rt_k3y_2024', BILLING_WEBHOOK: '/v2/webhooks/stripe' }");
  }, 28000 + Math.random() * 5000);

  // Fake GraphQL introspection "leak"
  setTimeout(() => {
    console.debug("[graphql] Introspection enabled at /v2/graphql?token=introspect_t0k3n_d3v. Schema: credits { override(amount: Int!, bypass: Boolean): Result }");
  }, 35000 + Math.random() * 5000);

  // Hidden HTML comments with fake data (visible in Elements tab)
  const comment1 = document.createComment(" TODO: remove before deploy - admin endpoint: https://api-prod.cloudservicex.net/v2/admin ");
  const comment2 = document.createComment(" FIXME: hardcoded API key for testing: sk_test_f4k3_h4rdc0d3d_k3y_2024 ");
  const comment3 = document.createComment(" DEBUG: override credits at /v2/admin/credits/set?key=mk_prod_x7k9m2p4q8r1t5w3y6z0_v2&amount=99999 ");
  document.head.appendChild(comment1);
  document.body.appendChild(comment2);
  document.body.appendChild(comment3);
})();

createRoot(document.getElementById("root")!).render(<App />);
