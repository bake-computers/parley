import type { ExecutionContext, MessageBatch } from "@cloudflare/workers-types";
import { DiscordBot } from "@parley/discord-runtime";
import * as interactions from "./interactions";
import type { WorkerEnv } from "./env";
import { handleStatsRefreshQueue, type StatsRefreshMessage } from "./queues/stats-refresh";

export const bot = new DiscordBot();

bot.loadHandlers(...Object.values(interactions));

export default {
  fetch: (request: Request, env: WorkerEnv, ctx: ExecutionContext) => bot.fetch(request, env, ctx),
  queue: (batch: MessageBatch<StatsRefreshMessage>, env: WorkerEnv, ctx: ExecutionContext) =>
    handleStatsRefreshQueue(batch as MessageBatch<StatsRefreshMessage>, env, ctx),
};
