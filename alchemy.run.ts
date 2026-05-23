import alchemy from "alchemy";
import { Worker } from "alchemy/cloudflare";

const app = await alchemy("parley");

const worker = await Worker("parley", {
  name: `${app.name}-${app.stage}`,
  entrypoint: "./src/index.ts",
  cwd: "./apps/worker",
  compatibilityDate: "2025-05-14",
  compatibilityFlags: ["nodejs_compat"],
  placement: { mode: "smart" },
  bindings: {
    DISCORD_PUBLIC_KEY: alchemy.secret(process.env.DISCORD_PUBLIC_KEY as string),
    DISCORD_BOT_TOKEN: alchemy.secret(process.env.DISCORD_BOT_TOKEN as string),
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID as string,
    DISCORD_BOT_OWNER_ID: (process.env.DISCORD_BOT_OWNER_ID as string) ?? "",
    ENGINE_SERVICE_URL: (process.env.ENGINE_SERVICE_URL as string) ?? "http://localhost:50051",
  },
  url: true,
  observability: { enabled: true },
  logpush: true,
  domains: ["app.parley.bot"],
});

console.log(`Worker deployed: ${worker.url}`);
await app.finalize();
