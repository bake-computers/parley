import type {
  ExecutionContext,
  MessageBatch,
  ScheduledController,
} from "@cloudflare/workers-types";
import { DiscordBot } from "@parley/discord-runtime";
import * as interactions from "./interactions";
import type { WorkerEnv } from "./env";
import { handleStatsRefreshQueue, type StatsRefreshMessage } from "./queues/stats-refresh";
import { processTournamentAutoStarts } from "./interactions/team";
import { createRuntimeDbHandle, ManagedExecutionContext } from "./runtime-db";

export const bot = new DiscordBot();

bot.loadHandlers(...Object.values(interactions));

export default {
  fetch: async (request: Request, env: WorkerEnv, ctx: ExecutionContext) => {
    const handle = await createRuntimeDbHandle(env);
    const managedContext = new ManagedExecutionContext(ctx, handle.close);

    try {
      return await bot.fetch(request, handle.env, managedContext as unknown as ExecutionContext);
    } finally {
      managedContext.markResponseReturned();
    }
  },
  queue: async (
    batch: MessageBatch<StatsRefreshMessage>,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ) => {
    const handle = await createRuntimeDbHandle(env);

    try {
      await handleStatsRefreshQueue(batch as MessageBatch<StatsRefreshMessage>, handle.env, ctx);
    } finally {
      await handle.close();
    }
  },
  scheduled: async (controller: ScheduledController, env: WorkerEnv) => {
    const handle = await createRuntimeDbHandle(env);

    try {
      await processTournamentAutoStarts(handle.env, controller.scheduledTime);
    } finally {
      await handle.close();
    }
  },
};
