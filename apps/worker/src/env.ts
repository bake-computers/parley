import type { DurableObjectNamespace, KVNamespace, Queue } from "@cloudflare/workers-types";
import type { DbClient } from "@parley/db/client";
import type { DiscordRuntimeEnv } from "@parley/discord-runtime";
import type { StatsRefreshMessage } from "./queues/stats-refresh";

export interface WorkerEnv extends DiscordRuntimeEnv {
  ANALYTICS_ENGINE: AnalyticsEngineDataset;
  AUTH_COOKIE_DOMAIN?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  Cache: KVNamespace;
  DISCORD_OAUTH_CLIENT_ID?: string;
  DISCORD_OAUTH_CLIENT_SECRET?: string;
  HYPERDRIVE: Hyperdrive;
  LeaderboardDO: DurableObjectNamespace;
  Queue: Queue<StatsRefreshMessage>;
}

export interface WorkerRuntimeEnv extends WorkerEnv {
  db?: DbClient;
}
