import { DiscordBot } from "./lib/discord";
import * as interactions from "./interactions";
import { handleStatsRefreshQueue, type StatsRefreshMessage } from "./queues/stats-refresh";

export const bot = new DiscordBot();

bot.loadHandlers(...Object.values(interactions));

export default {
  fetch: (request, env, ctx) => bot.fetch(request, env, ctx),
  queue: (batch, env, ctx) =>
    handleStatsRefreshQueue(batch as MessageBatch<StatsRefreshMessage>, env, ctx),
} satisfies ExportedHandler<Env>;
