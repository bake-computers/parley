import alchemy from "alchemy";
import { DurableObjectNamespace, Worker } from "alchemy/cloudflare";

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

const leaderboardBridge = await Worker("leaderboard-bridge", {
  name: `${app.name}-leaderboard-${app.stage}`,
  entrypoint: "./src/index.ts",
  cwd: "./apps/leaderboard-bridge",
  compatibilityDate: "2025-05-14",
  compatibilityFlags: ["nodejs_compat"],
  placement: { mode: "smart" },
  bindings: {
    GLOBAL_LEADERBOARD: DurableObjectNamespace("GLOBAL_LEADERBOARD", {
      className: "GlobalLeaderboard",
      sqlite: true,
    }),
    ENGINE_SERVICE_URL: process.env.ENGINE_SERVICE_URL ?? "http://localhost:50051",
    ALLOWED_ORIGINS:
      process.env.LEADERBOARD_ALLOWED_ORIGINS ??
      "https://parley.bot,http://localhost:3000,http://127.0.0.1:3000",
    POLL_INTERVAL_MS: process.env.LEADERBOARD_POLL_INTERVAL_MS ?? "60000",
  },
  url: true,
  observability: { enabled: true },
  logpush: true,
  domains: [{ domainName: "leaderboard.parley.bot", overrideExistingOrigin: true }],
});

console.log(`Leaderboard bridge deployed: ${leaderboardBridge.url}`);
await app.finalize();
