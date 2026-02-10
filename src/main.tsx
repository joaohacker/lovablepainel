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
  "%c🤖 Ah, você é desenvolvedor? Manda um salve: @lovablecredits",
  "font-size: 14px; color: #69db7c; font-style: italic;"
);

createRoot(document.getElementById("root")!).render(<App />);
