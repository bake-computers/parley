import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  outDir: "dist",
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
  dts: false,
  shims: true,
  external: ["hono"],
  esbuildOptions(options) {
    options.conditions = ["module"];
  },
});
