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

createRoot(document.getElementById("root")!).render(<App />);
