/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// prismjs-Grammatik-Dateien haben keine Typen; sie werden nur wegen ihres
// Seiteneffekts geladen (Registrierung auf dem globalen Prism).
declare module "prismjs/components/prism-powershell";

/** Aus `package.json` beim Build eingesetzt (siehe `define` in vite.config.ts). */
declare const __APP_VERSION__: string;
/** Zeitpunkt des Builds als ISO-String. */
declare const __BUILD_TIME__: string;
