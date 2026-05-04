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
import { handleAuthRequest } from "./auth";
import {
  handleDashboardGuilds,
  handleDashboardGuildDetail,
  handleDashboardGuildHistory,
} from "./dashboard-handler";
import { handleLeaderboardRequest, handleLeaderboardNotify } from "./leaderboard-handler";
import { LeaderboardDO } from "./leaderboard-do";
import { getAggregateStats, type AggregateStats } from "@parley/db/stats-queries";

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

const STATS_CACHE_KEY = "stats:aggregate";
const STATS_CACHE_TTL_SECONDS = 60;

async function fetchCachedStats(env: WorkerEnv): Promise<AggregateStats | null> {
  if (!env.Cache) return null;

  try {
    const cached = await env.Cache.get(STATS_CACHE_KEY, "json");
    if (cached && typeof cached === "object") {
      const maybe = cached as Partial<AggregateStats>;
      if (
        typeof maybe.totalPlayers === "number" &&
        typeof maybe.matchesToday === "number" &&
        typeof maybe.tournamentsCompleted === "number" &&
        typeof maybe.serverCount === "number"
      ) {
        return maybe as AggregateStats;
      }
    }
  } catch {
    // Cache read failed
  }
  return null;
}

async function cacheStats(env: WorkerEnv, stats: AggregateStats): Promise<void> {
  if (!env.Cache) return;

  try {
    await env.Cache.put(STATS_CACHE_KEY, JSON.stringify(stats), {
      expirationTtl: STATS_CACHE_TTL_SECONDS,
    });
  } catch {
    // Cache write failed
  }
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

function withCors(response: Response, origin: string): Response {
  // WebSocket upgrade responses (101) must not be re-wrapped —
  // they carry a `webSocket` property that `new Response()` strips.
  if (response.status === 101) {
    return response;
  }

  const headers = new Headers(response.headers);
  const cors = corsHeaders(origin);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  fetch: async (request: Request, env: WorkerEnv, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "*";
    const isApiRequest = url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/");

    if (isApiRequest && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    let response: Response;

    if (url.pathname.startsWith("/api/auth/")) {
      response = await handleAuthRequest(request, env, ctx);
    } else if (url.pathname === "/api/leaderboard") {
      response = await handleLeaderboardRequest(request, env, ctx);
    } else if (url.pathname === "/api/leaderboard/notify") {
      response = await handleLeaderboardNotify(request, env, ctx);
    } else if (url.pathname === "/api/dashboard/guilds") {
      response = await handleDashboardGuilds(request, env, ctx);
    } else {
      const guildDetailMatch = url.pathname.match(/^\/api\/dashboard\/guilds\/([^/]+)$/);
      if (guildDetailMatch && guildDetailMatch[1]) {
        response = await handleDashboardGuildDetail(request, env, ctx, guildDetailMatch[1]);
      } else {
        const guildHistoryMatch = url.pathname.match(
          /^\/api\/dashboard\/guilds\/([^/]+)\/history$/,
        );
        if (guildHistoryMatch && guildHistoryMatch[1]) {
          response = await handleDashboardGuildHistory(request, env, ctx, guildHistoryMatch[1]);
        } else if (url.pathname === "/api/stats") {
          const cached = await fetchCachedStats(env);
          if (cached) {
            response = Response.json(cached, {
              headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
            });
          } else {
            const handle = await createRuntimeDbHandle(env);
            try {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const todayMs = today.getTime();

              const stats = await getAggregateStats(handle.env.db ?? null, todayMs);
              await cacheStats(env, stats);

              response = Response.json(stats, {
                headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
              });
            } finally {
              await handle.close();
            }
          }
        } else if (url.pathname === "/ws/leaderboard") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stub = env.LeaderboardDO.get(env.LeaderboardDO.idFromName("global"));
          response = await (stub as any).fetch(request);
        } else {
          const handle = await createRuntimeDbHandle(env);
          const managedContext = new ManagedExecutionContext(ctx, handle.close);

          try {
            response = await bot.fetch(
              request,
              handle.env,
              managedContext as unknown as ExecutionContext,
            );
          } finally {
            managedContext.markResponseReturned();
          }
        }
      }
    }

    if (isApiRequest) {
      response = withCors(response, origin);
    }

    return response;
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

export { LeaderboardDO };
