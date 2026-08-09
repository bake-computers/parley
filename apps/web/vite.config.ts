import { defineConfig, type PluginOption } from "vite-plus";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@mdx-js/rollup";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";

export default defineConfig(async ({ mode }) => {
  const devOnly: PluginOption[] = [];
  if (mode === "development") {
    const { devtools } = await import("@tanstack/devtools-vite");
    devOnly.push(devtools());
  }

  const plugins: PluginOption[] = [
    ...devOnly,
    cloudflare({ viteEnvironment: { name: "ssr" }, remoteBindings: true }),
    // Compiles docs content (.mdx) to plain JS before the React plugin sees it.
    mdx({
      remarkPlugins: [remarkGfm, remarkFrontmatter],
    }),
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
          },
        },
      },
    },
    plugins,
  };
});
