import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Nach einem Deploy erhalten die lazy-geladenen Chunks neue Hash-Dateinamen.
// Ein bereits geöffneter Client (oder eine Cloudflare-Edge-Propagations-Lücke)
// kann dann einen alten Chunk anfordern, der nicht mehr existiert – Cloudflare
// liefert wegen "/* /index.html 200" die index.html (text/html) zurück und der
// dynamische Import schlägt fehl. Vite feuert dafür "vite:preloadError".
// Wir laden die Seite dann einmal neu, um die aktuelle index.html + Chunks zu holen.
window.addEventListener("vite:preloadError", () => {
  const KEY = "vite:preloadError:lastReload";
  const now = Date.now();
  const last = Number(sessionStorage.getItem(KEY) ?? "0");
  // Endlosschleife vermeiden: höchstens ein automatischer Reload pro 10 Sekunden.
  if (now - last < 10_000) return;
  sessionStorage.setItem(KEY, String(now));
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
