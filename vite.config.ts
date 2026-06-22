import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
