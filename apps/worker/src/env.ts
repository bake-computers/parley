import type { D1Database, KVNamespace, Queue } from "@cloudflare/workers-types";
import type { DiscordRuntimeEnv } from "@parley/discord-runtime";
import type { StatsRefreshMessage } from "./queues/stats-refresh";

export interface WorkerEnv extends DiscordRuntimeEnv {
  Cache: KVNamespace;
  Database: D1Database;
  Queue: Queue<StatsRefreshMessage>;
}
