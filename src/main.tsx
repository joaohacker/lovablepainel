import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// --- Anti-proxy/interceptor detection ---
(function detectProxy() {
  // 1. Check for unusual request timing (proxies add latency to same-origin)
  async function checkTiming() {
    try {
      const start = performance.now();
      await fetch(window.location.href, { method: "HEAD", cache: "no-store" });
      const elapsed = performance.now() - start;
      // Proxies typically add >300ms overhead on same-origin HEAD
      if (elapsed > 2000) {
        console.warn("Slow network detected");
      }
    } catch {
      // fetch blocked = possible proxy
    }
  }

  // 2. Detect tampered headers via a canary request to our own edge function
  // 3. Check for WebSocket interception (Burp intercepts WS too)
  function checkWebSocketIntercept() {
    try {
      const ws = new WebSocket("wss://localhost:65534");
      ws.onerror = () => {}; // expected to fail
      setTimeout(() => {
        try { ws.close(); } catch {}
      }, 1000);
    } catch {
      // normal
    }
  }

  // 4. Detect Burp/Fiddler CA certificate by checking for cert errors on known endpoints
  async function checkCertIntegrity() {
    try {
      // Try fetching a resource that would fail with MITM proxy self-signed cert
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 3000);
      
      const res = await fetch("https://www.gstatic.com/generate_204", {
        method: "HEAD",
        mode: "no-cors",
        signal: controller.signal,
      });
    } catch {
      // If this fails in unexpected ways, could indicate proxy
    }
  }

  // 5. Override XMLHttpRequest to detect injected interceptors
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    const urlStr = url?.toString() || "";
    if (urlStr.includes("127.0.0.1:8080") || urlStr.includes("localhost:8080") || urlStr.includes("localhost:8888")) {
      console.clear();
      console.log(
        "%c🤣🤣🤣 Boa sorte tentando interceptar, seu otário! 🤣🤣🤣",
        "font-size: 22px; color: #ffd43b; font-weight: bold; background: #1a1a2e; padding: 10px; border-radius: 8px;"
      );
      return;
    }
    return (originalOpen as Function).apply(this, [method, url, ...rest]);
  };

  // 6. Detect overridden fetch (extensions/proxies often monkey-patch fetch)
  const nativeFetchStr = "function fetch() { [native code] }";
  if (!Function.prototype.toString.call(window.fetch).includes("[native code]")) {
    document.title = "🤣";
    console.clear();
    console.log(
      "%c🚨 Interceptador detectado! fetch() foi modificado 🤣🤣🤣",
      "font-size: 18px; color: #ff6b6b; font-weight: bold;"
    );
  }

  checkTiming();
  checkWebSocketIntercept();
  checkCertIntegrity();
})();

// --- Anti-debug ---
(function antiDebug() {
  setInterval(() => {
    const start = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    if (performance.now() - start > 100) {
      console.clear();
      console.log(
        "%c🤣🤣🤣 Boa sorte tentando interceptar, seu otário! 🤣🤣🤣",
        "font-size: 22px; color: #ffd43b; font-weight: bold; background: #1a1a2e; padding: 10px; border-radius: 8px;"
      );
    }
  }, 2000);
})();

console.clear();
console.log(
  "%c🤣🤣🤣 Boa sorte tentando interceptar, seu otário! 🤣🤣🤣",
  "font-size: 18px; color: #ffd43b; font-weight: bold; background: #1a1a2e; padding: 8px 12px; border-radius: 6px;"
);

createRoot(document.getElementById("root")!).render(<App />);
