// oxlint-disable-next-line import/no-unassigned-import
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  schema: "./src/schema.ts",
  dialect: "postgresql",
  out: "./drizzle",
  verbose: true,
  strict: true,
  dbCredentials: {
    url: databaseUrl,
  },
});
