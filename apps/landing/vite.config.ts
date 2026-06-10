import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import alchemy from "alchemy/cloudflare/tanstack-start";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), cloudflare({viteEnvironment: "ssr" }), tailwindcss(), tanstackStart(), viteReact()],
});

export default config;
