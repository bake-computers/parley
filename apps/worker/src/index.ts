import type {
  ExecutionContext,
  MessageBatch,
  ScheduledController,
} from "@cloudflare/workers-types";
import { DiscordBot } from "@parley/discord-runtime";
import * as interactions from "./interactions";
import type { WorkerEnv } from "./env";
import {
  handleStatsRefreshQueue,
  type StatsRefreshMessage,
  type StatsRefreshQueueSummary,
} from "./queues/stats-refresh";
import { processTournamentAutoStarts } from "./interactions/team";
import { createRuntimeDbHandle, ManagedExecutionContext } from "./runtime-db";
import { analyticsMiddleware } from "./analytics-middleware";
import { writeAnalyticsDataPoint } from "./analytics";

export const bot = new DiscordBot();

bot.use(analyticsMiddleware);
bot.loadHandlers(...Object.values(interactions));

function readQueueSummary(error: unknown): StatsRefreshQueueSummary | null {
  if (
    error !== null &&
    typeof error === "object" &&
    "statsRefreshQueueSummary" in error &&
    error.statsRefreshQueueSummary !== null &&
    typeof error.statsRefreshQueueSummary === "object"
  ) {
    return error.statsRefreshQueueSummary as StatsRefreshQueueSummary;
  }
  return null;
}

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
    const startedAt = Date.now();

    try {
      const summary = await handleStatsRefreshQueue(
        batch as MessageBatch<StatsRefreshMessage>,
        handle.env,
        ctx,
      );
      writeAnalyticsDataPoint(handle.env, {
        source: "worker",
        surface: "queue",
        name: "stats.refresh",
        outcome: summary.invalidMessageCount > 0 ? "invalid_message" : "ok",
        durationMs: Date.now() - startedAt,
        itemCount: batch.messages.length,
        successCount: summary.successCount,
        errorCount: summary.invalidMessageCount + summary.retryCount,
      });
    } catch (error) {
      const summary = readQueueSummary(error);
      writeAnalyticsDataPoint(handle.env, {
        source: "worker",
        surface: "queue",
        name: "stats.refresh",
        outcome: "error",
        durationMs: Date.now() - startedAt,
        itemCount: batch.messages.length,
        successCount: summary?.successCount ?? 0,
        errorCount: (summary?.invalidMessageCount ?? 0) + (summary?.retryCount ?? 1),
      });
      throw error;
    } finally {
      await handle.close();
    }
  },
  scheduled: async (controller: ScheduledController, env: WorkerEnv) => {
    const handle = await createRuntimeDbHandle(env);
    const startedAt = Date.now();

    try {
      const startedCount = await processTournamentAutoStarts(handle.env, controller.scheduledTime);
      writeAnalyticsDataPoint(handle.env, {
        source: "worker",
        surface: "scheduled",
        name: "tournament.auto_start",
        outcome: "ok",
        durationMs: Date.now() - startedAt,
        itemCount: startedCount,
        successCount: 1,
        errorCount: 0,
      });
    } catch (error) {
      writeAnalyticsDataPoint(handle.env, {
        source: "worker",
        surface: "scheduled",
        name: "tournament.auto_start",
        outcome: "error",
        durationMs: Date.now() - startedAt,
        itemCount: 0,
        successCount: 0,
        errorCount: 1,
      });
      throw error;
    } finally {
      await handle.close();
    }
  },
};
