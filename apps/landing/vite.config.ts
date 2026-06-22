import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const config = defineConfig(({ mode }) => ({
  resolve: { tsconfigPaths: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("lucide-react")) {
            return "icons";
          }
          if (id.includes("@tanstack/react-router")) {
            return "router";
          }
          if (id.includes("HeroShaderOverlay") || id.includes("hero-shader")) {
            return "hero-shader";
          }
          if (id.includes("i18n-messages.de")) {
            return "i18n-de";
          }
          if (id.includes("i18n-messages.en")) {
            return "i18n-en";
          }
          if (id.includes("@unpic/react")) {
            return "unpic";
          }
        },
      },
    },
  },
  plugins: [
    ...(mode === "development" ? [devtools()] : []),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart({
      sitemap: {
        enabled: true,
        host: "https://parley.bot",
        outputPath: "sitemap.xml",
      },
    }),
    viteReact(),
  ],
}));

export default config;
