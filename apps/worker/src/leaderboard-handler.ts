import type { ExecutionContext } from "@cloudflare/workers-types";
import { createRuntimeDbHandle, ManagedExecutionContext } from "./runtime-db";
import type { WorkerEnv } from "./env";
import { listGlobalLeaderboardPage, countGlobalLeaderboard } from "@parley/db/leaderboard";
import type { GlobalLeaderboardEntry } from "@parley/db/leaderboard";

function leaderboardUnavailableResponse(): Response {
  return Response.json(
    {
      error: "leaderboard_unavailable",
      message: "Leaderboard is unavailable because the database connection is offline.",
    },
    { status: 503 },
  );
}

interface LeaderboardResponse {
  entries: GlobalLeaderboardEntry[];
  totalPlayers: number;
  page: number;
  pageSize: number;
}

export async function handleLeaderboardRequest(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get("page") ?? 1)));
  const pageSize = Math.max(
    1,
    Math.min(100, Math.trunc(Number(url.searchParams.get("pageSize") ?? 50))),
  );

  const handle = await createRuntimeDbHandle(env);
  if (!handle.env.db) {
    await handle.close();
    return leaderboardUnavailableResponse();
  }

  const managedContext = new ManagedExecutionContext(ctx, handle.close);

  try {
    const offset = (page - 1) * pageSize;
    const [entries, totalPlayers] = await Promise.all([
      listGlobalLeaderboardPage(handle.env.db, {
        platform: "all",
        minMatches: 0,
        limit: pageSize,
        offset,
      }),
      countGlobalLeaderboard(handle.env.db, {
        platform: "all",
        minMatches: 0,
      }),
    ]);

    const response: LeaderboardResponse = {
      entries,
      totalPlayers,
      page,
      pageSize,
    };

    return Response.json(response, {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=60",
      },
    });
  } finally {
    managedContext.markResponseReturned();
  }
}
