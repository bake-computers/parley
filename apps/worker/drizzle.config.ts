import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";
import { normalizePgConnectionString } from "@parley/db/client";

function loadEnvSync(filepath: string): void {
  try {
    const content = readFileSync(filepath, "utf8");
    for (const rawLine of content.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith("#")) {
        continue;
      }
      const normalizedLine = line.startsWith("export ") ? line.slice("export ".length) : line;
      const separatorIndex = normalizedLine.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }
      const key = normalizedLine.slice(0, separatorIndex).trim();
      let value = normalizedLine.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key.length > 0 && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore missing env files
  }
}

const workerDir = resolve(import.meta.dirname ?? ".");
loadEnvSync(resolve(workerDir, ".env.local"));
loadEnvSync(resolve(workerDir, ".env"));

export default defineConfig({
  schema: "../../packages/db/src/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizePgConnectionString(process.env.DATABASE_URL ?? ""),
  },
  strict: true,
  verbose: true,
});
