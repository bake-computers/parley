import alchemy from "alchemy";
import {
  DurableObjectNamespace,
  TanStackStart,
  Worker,
  WorkerRef,
  WranglerJson,
} from "alchemy/cloudflare";

const prepare = process.argv.includes("--prepare");
const appName = "parley";
const stage = process.env.ALCHEMY_STAGE ?? process.env.NODE_ENV ?? "dev";

// Match existing Cloudflare worker script names (override in .env if needed).
const workerNames = {
  parley: process.env.PARLEY_WORKER_NAME ?? "parley-dev",
  landing: process.env.LANDING_WORKER_NAME ?? "landing",
  bridge: process.env.BRIDGE_WORKER_NAME ?? "leaderboard-bridge",
} as const;

const app = await alchemy(prepare ? "parley-prepare" : appName, {
  password: process.env.ALCHEMY_SECRET_PASSPHRASE,
  stage,
  adopt: !prepare,
  ...(prepare ? { local: true, destroyOrphans: false } : {}),
});

const axiomBindings = {
  ...(process.env.AXIOM_TOKEN ? { AXIOM_TOKEN: alchemy.secret(process.env.AXIOM_TOKEN) } : {}),
  AXIOM_DATASET: process.env.AXIOM_DATASET ?? "parley",
  ...(process.env.AXIOM_ORG_ID ? { AXIOM_ORG_ID: process.env.AXIOM_ORG_ID } : {}),
  ...(process.env.AXIOM_EDGE ? { AXIOM_EDGE: process.env.AXIOM_EDGE } : {}),
  ...(process.env.AXIOM_EDGE_URL ? { AXIOM_EDGE_URL: process.env.AXIOM_EDGE_URL } : {}),
  AXIOM_ENABLED: process.env.AXIOM_ENABLED ?? "true",
};

const landingProps = {
  name: workerNames.landing,
  cwd: "./apps/landing",
  compatibilityDate: "2025-09-02",
  compatibilityFlags: ["nodejs_compat"],
  observability: { enabled: true },
  domains: [{ domainName: "parley.bot", overrideExistingOrigin: true }],
};

if (prepare) {
  await WranglerJson({
    path: ".alchemy/local/wrangler.jsonc",
    worker: {
      ...landingProps,
      entrypoint: "dist/server/index.js",
      bindings: {
        BRIDGE: WorkerRef({ service: workerNames.bridge }),
      },
    },
    transform: {
      wrangler: (spec) => ({
        ...spec,
        main: "@tanstack/react-start/server-entry",
        observability: landingProps.observability,
      }),
    },
  });

  await app.finalize();
  process.exit(0);
}

const worker = await Worker("parley", {
  name: workerNames.parley,
  adopt: true,
  entrypoint: "./src/index.ts",
  cwd: "./apps/worker",
  compatibilityDate: "2025-05-14",
  compatibilityFlags: ["nodejs_compat"],
  placement: { mode: "smart" },
  dev: { port: 8787 },
  bindings: {
    ...axiomBindings,
    SERVICE_NAME: "worker",
    ...(process.env.DISCORD_PUBLIC_KEY
      ? { DISCORD_PUBLIC_KEY: alchemy.secret(process.env.DISCORD_PUBLIC_KEY) }
      : {}),
    ...(process.env.DISCORD_BOT_TOKEN
      ? { DISCORD_BOT_TOKEN: alchemy.secret(process.env.DISCORD_BOT_TOKEN) }
      : {}),
    ...(process.env.DISCORD_APPLICATION_ID
      ? { DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID }
      : {}),
    ...(process.env.DISCORD_BOT_OWNER_ID
      ? { DISCORD_BOT_OWNER_ID: process.env.DISCORD_BOT_OWNER_ID }
      : {}),
    ENGINE_SERVICE_URL: process.env.ENGINE_SERVICE_URL ?? "http://localhost:50051",
  },
  url: false,
  observability: { enabled: true },
  logpush: true,
  domains: [{ domainName: "app.parley.bot", overrideExistingOrigin: true }],
});

console.log(`Worker deployed: app.parley.bot`);

const bridge = await Worker("bridge", {
  name: workerNames.bridge,
  adopt: true,
  entrypoint: "./src/index.ts",
  cwd: "./apps/bridge",
  compatibilityDate: "2025-05-14",
  compatibilityFlags: ["nodejs_compat"],
  placement: { mode: "smart" },
  dev: { port: 8788 },
  bindings: {
    ...axiomBindings,
    SERVICE_NAME: "bridge",
    GLOBAL_LEADERBOARD: DurableObjectNamespace("GLOBAL_LEADERBOARD", {
      className: "GlobalLeaderboard",
      sqlite: true,
    }),
    ENGINE_SERVICE_URL: process.env.ENGINE_SERVICE_URL ?? "http://localhost:50051",
    ALLOWED_ORIGINS:
      process.env.BRIDGE_ALLOWED_ORIGINS ??
      "https://parley.bot,http://localhost:3000,http://127.0.0.1:3000",
    POLL_INTERVAL_MS: process.env.BRIDGE_POLL_INTERVAL_MS ?? "60000",
  },
  url: false,
  observability: { enabled: true },
  logpush: true,
  domains: [{ domainName: "bridge.parley.bot", overrideExistingOrigin: true }],
});

console.log(`Bridge deployed: bridge.parley.bot`);

const landing = await TanStackStart("landing", {
  ...landingProps,
  adopt: true,
  dev: { command: "bun run dev:landing", domain: "localhost:3000" },
  bindings: {
    BRIDGE: bridge,
  },
});

console.log(`Landing deployed: ${landing.url}`);

await app.finalize();
