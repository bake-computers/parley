import { defineConfig } from "astro/config";
import icon from "astro-icon";
import tailwindcss from "@tailwindcss/vite";
import nimbus, { defineConfig as defineNimbusConfig } from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";

const nimbusConfig = defineNimbusConfig({
  site: "https://docs.parley.bot",
  title: "Parley",
  description:
    "Help and guides for Parley: skill-matched Rainbow Six Siege matches, ranks, and tournaments on Discord.",
  locale: "en",
  homeLabel: "Docs",
  github: null,
  socialImageAlt: "Parley documentation",
  head: [
    {
      tag: "link",
      attrs: { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    },
    { tag: "meta", attrs: { name: "theme-color", content: "#17171a" } },
  ],
  sidebar: {
    overviewLabel: "Overview",
    indexDisplay: "header-link",
  },
});

export default defineConfig({
  site: "https://docs.parley.bot",
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    icon(),
    nimbus(nimbusConfig, {
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
      },
      markdown: {
        hastPlugins: [tableScroll()],
      },
    }),
  ],
});
