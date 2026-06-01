import alchemy from "alchemy";
import { Worker } from "alchemy/cloudflare";

const app = await alchemy("parley", {
  password: process.env.ALCHEMY_SECRET_PASSPHRASE,
  stage: process.env.NODE_ENV ?? "dev",
});

const worker = await Worker("parley", {
  name: `${app.name}-${app.stage}`,
  entrypoint: "./src/index.ts",
  cwd: "./apps/worker",
  compatibilityDate: "2025-05-14",
  compatibilityFlags: ["nodejs_compat"],
  placement: { mode: "smart" },
  bindings: {
    ...(process.env.DISCORD_PUBLIC_KEY
      ? { DISCORD_PUBLIC_KEY: alchemy.secret(process.env.DISCORD_PUBLIC_KEY) }
      : {}),
    ...(process.env.DISCORD_BOT_TOKEN
      ? { DISCORD_BOT_TOKEN: alchemy.secret(process.env.DISCORD_BOT_TOKEN) }
      : {}),
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID as string,
    DISCORD_BOT_OWNER_ID: process.env.DISCORD_BOT_OWNER_ID ?? "",
    ENGINE_SERVICE_URL: process.env.ENGINE_SERVICE_URL ?? "http://localhost:50051",
  },
  url: true,
  observability: { enabled: true },
  logpush: true,
  domains: [{ domainName: "app.parley.bot", overrideExistingOrigin: true }],
});

console.log(`Worker deployed: ${worker.url}`);
await app.finalize();
