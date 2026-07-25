/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// prismjs-Grammatik-Dateien haben keine Typen; sie werden nur wegen ihres
// Seiteneffekts geladen (Registrierung auf dem globalen Prism).
declare module "prismjs/components/prism-powershell";
