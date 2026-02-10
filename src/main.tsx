import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Anti-debug: triggers debugger when DevTools is open
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
