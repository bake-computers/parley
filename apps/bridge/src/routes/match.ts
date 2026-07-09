import type { Context } from "hono";
import type { AxiomVariables } from "@parley/axiom";
import type { Env } from "#/types";
import { resolveEngineTransport } from "#/engine-transport";

const GAME_R6 = 1;
const KV_TTL_SECONDS = 3600;

type AppContext = Context<{ Bindings: Env; Variables: AxiomVariables }>;

interface EngineMatchResponse {
  success?: boolean;
  match?: Record<string, unknown>;
  error?: { message?: string };
}

function kvKey(uuid: string): string {
  return `match:json:${uuid}`;
}

export async function matchHandler(c: AppContext): Promise<Response> {
  const uuid = c.req.param("uuid");

  if (!uuid || typeof uuid !== "string") {
    return c.json({ error: "missing uuid" }, 400);
  }

  const key = kvKey(uuid);

  const cached = await c.env.MATCH_KV.get(key, "json");
  if (cached !== null) {
    return c.json(cached, 200, {
      "X-Cache": "HIT",
      "Cache-Control": "public, max-age=300",
    });
  }

  const { baseUrl, fetchImpl } = resolveEngineTransport(c.env);
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/parley.matchmaking.v1.MatchmakingService/GetMatchByUuid`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicUuid: uuid, game: GAME_R6 }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404) {
      return c.json({ error: "match not found" }, 404);
    }
    return c.json({ error: `engine error (${res.status}): ${body}` }, 500);
  }

  const data = (await res.json()) as EngineMatchResponse;

  if (data.success !== true || data.match === undefined) {
    const message = data.error?.message ?? "match not found";
    return c.json({ error: message }, 404);
  }

  await c.env.MATCH_KV.put(key, JSON.stringify(data.match), {
    expirationTtl: KV_TTL_SECONDS,
  });

  return c.json(data.match, 200, {
    "X-Cache": "MISS",
  });
}
