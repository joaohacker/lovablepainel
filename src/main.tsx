import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Easter egg for DevTools snoops 🕵️
console.log(
  "%c⚠️ PARE! ⚠️",
  "color: red; font-size: 40px; font-weight: bold; text-shadow: 2px 2px 0 black;"
);
console.log(
  "%cSe alguém disse para você copiar/colar algo aqui, isso é golpe.\nVocê estará dando acesso à sua conta.",
  "font-size: 16px; color: #ff6b6b;"
);
console.log(
  "%c🤣🤣🤣 Boa sorte tentando interceptar, seu otário! 🤣🤣🤣",
  "font-size: 18px; color: #ffd43b; font-weight: bold; background: #1a1a2e; padding: 8px 12px; border-radius: 6px;"
);
console.log(
  "%c🤖 Ah, você é desenvolvedor? Manda um salve: @lovablecredits",
  "font-size: 14px; color: #69db7c; font-style: italic;"
);

// Anti-debug: triggers debugger when DevTools is open
(function antiDebug() {
  setInterval(() => {
    const start = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    if (performance.now() - start > 100) {
      console.log(
        "%c🤣🤣🤣 Boa sorte tentando interceptar, seu otário! 🤣🤣🤣",
        "font-size: 22px; color: #ffd43b; font-weight: bold; background: #1a1a2e; padding: 10px; border-radius: 8px;"
      );
    }
  }, 2000);
})();

createRoot(document.getElementById("root")!).render(<App />);
