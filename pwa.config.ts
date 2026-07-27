import type { VitePWAOptions } from "vite-plugin-pwa";

export const pwaOptions: Partial<VitePWAOptions> = {
  // Bei einem Deploy ändern sich die Dateinamen der lazy geladenen Chunks. Die
  // neue Version muss daher ohne manuelle Interaktion aktiv werden, damit kein
  // alter Service-Worker eine nicht mehr passende Chunk-Menge ausliefert.
  registerType: "autoUpdate",
  injectRegister: false,
  manifest: {
    name: "RVTools Analyzer",
    short_name: "RVTools",
    description: "Lokales VMware-Infrastruktur-Dashboard für RVTools XLSX-Exporte",
    lang: "de",
    start_url: "/",
    display: "standalone",
    theme_color: "#0d0f12",
    background_color: "#0d0f12",
    icons: [
      { src: "/icons/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/pwa-512x512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: {
    // `injectRegister: false` verschiebt die Registrierung in die React-
    // Komponente. Deshalb müssen diese beiden GenerateSW-Optionen explizit
    // gesetzt werden, damit ein neuer Worker ohne Wartephase aktiv wird.
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: "StaleWhileRevalidate",
        options: { cacheName: "google-fonts-stylesheets" },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts-webfonts",
          cacheableResponse: { statuses: [0, 200] },
          expiration: { maxAgeSeconds: 60 * 60 * 24 * 365, maxEntries: 30 },
        },
      },
    ],
  },
};
