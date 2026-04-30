import type { KVNamespace, Queue } from "@cloudflare/workers-types";
import type { DbClient } from "@parley/db/client";
import type { DiscordRuntimeEnv } from "@parley/discord-runtime";
import type { StatsRefreshMessage } from "./queues/stats-refresh";

export interface WorkerEnv extends DiscordRuntimeEnv {
  ANALYTICS_ENGINE: AnalyticsEngineDataset;
  Cache: KVNamespace;
  HYPERDRIVE: Hyperdrive;
  Queue: Queue<StatsRefreshMessage>;
}

export interface WorkerRuntimeEnv extends WorkerEnv {
  db?: DbClient;
}
