import { defineConfig } from "drizzle-kit";
import { normalizePgConnectionString } from "@parley/db/client";

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
