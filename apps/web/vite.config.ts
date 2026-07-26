import { defineConfig, type PluginOption } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(async ({ mode }) => {
  const devOnly: PluginOption[] = [];
  if (mode === "development") {
    const { devtools } = await import("@tanstack/devtools-vite");
    devOnly.push(devtools());
  }

  const plugins: PluginOption[] = [
    ...devOnly,
    cloudflare({ viteEnvironment: { name: "ssr" }, remoteBindings: true }),
    tailwindcss(),
    tanstackStart({
      sitemap: {
        enabled: true,
        host: "https://parley.bot",
        outputPath: "sitemap.xml",
      },
    }),
    viteReact(),
  ];

  return {
    resolve: {
      tsconfigPaths: true,
      extensionAlias: {
        ".js": [".ts", ".tsx", ".js"],
      },
    },
    server: {
      hmr: {
        overlay: true,
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("lucide-react")) {
              return "icons";
            }
            if (id.includes("@tanstack/react-router")) {
              return "router";
            }
            if (id.includes("HeroShaderOverlay") || id.includes("hero-shader")) {
              return "hero-shader";
            }

            if (id.includes("@unpic/react")) {
              return "unpic";
            }
          },
        },
      },
    },
    plugins,
  };
});
