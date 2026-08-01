import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { pwaOptions } from "./pwa.config";
import packageJson from "./package.json";

const excludeViteEntryFromRocketLoader = {
  name: "exclude-vite-entry-from-rocket-loader",
  transformIndexHtml: {
    order: "post" as const,
    handler(html: string) {
      return html.replace(
        /<script type="module" crossorigin src="(\/assets\/[^"]+\.js)"><\/script>/,
        '<script type="module" crossorigin data-cfasync="false" src="$1"></script>',
      );
    },
  },
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), VitePWA(pwaOptions), excludeViteEntryFromRocketLoader].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Erlaubt es, einen Analyse-Export dem erzeugenden Codestand zuzuordnen.
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    rollupOptions: {
      output: {
        // Schwere, selten geänderte Libs in eigene Vendor-Chunks → bleiben über
        // App-Updates hinweg im Browser-Cache.
        manualChunks: {
          "vendor-charts": ["recharts"],
          "vendor-query": ["@tanstack/react-query", "@tanstack/react-table"],
        },
      },
    },
  },
}));
