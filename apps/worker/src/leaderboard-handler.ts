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

// Fire-and-forget notification forwarder for leaderboard events
export async function handleLeaderboardNotify(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  // Always respond quickly; forward payload to DO stub for processing
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  try {
    const stub = env.LeaderboardDO.get(env.LeaderboardDO.idFromName("global"));
    // Forward payload to DO as a Notify request; fire-and-forget
    const notifyReq = new Request("/notify", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
      headers: { "Content-Type": "application/json" },
    });
    // DO may implement a handler for /notify; we intentionally ignore the response
    (stub as any).fetch(notifyReq).catch(() => {
      // swallow failures to keep fire-and-forget semantics
    });
  } catch {
    // swallow errors to preserve fire-and-forget semantics
  }

  return new Response(null, { status: 202 });
}
