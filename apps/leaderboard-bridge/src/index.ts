import { Hono } from "hono";
import { GlobalLeaderboard } from "./do/global-leaderboard.js";
import {
  checkConnectionRateLimit,
  corsHeaders,
  isOriginAllowed,
  parseAllowedOrigins,
} from "./security.js";
import type { Env } from "./types.js";
import { metricToDoId, parseMetric } from "./types.js";

export { GlobalLeaderboard };

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true }));

app.options("/snapshot", (c) => {
  const allowed = parseAllowedOrigins(c.env.ALLOWED_ORIGINS);
  const origin = c.req.header("Origin") ?? null;
  const headers = corsHeaders(origin, allowed);
  if (headers === undefined) {
    return c.text("Forbidden", 403);
  }
  return new Response(null, { status: 204, headers });
});

app.get("/snapshot", async (c) => {
  const allowed = parseAllowedOrigins(c.env.ALLOWED_ORIGINS);
  const origin = c.req.header("Origin") ?? null;
  if (!isOriginAllowed(origin, allowed)) {
    return c.text("Forbidden", 403);
  }

  const metric = parseMetric(c.req.query("type"));
  if (metric === null) {
    return c.json({ error: "invalid metric" }, { status: 400 });
  }

  const stub = c.env.GLOBAL_LEADERBOARD.get(
    c.env.GLOBAL_LEADERBOARD.idFromName(metricToDoId(metric)),
  );
  const internalUrl = new URL("http://internal/snapshot");
  internalUrl.searchParams.set("metric", metric);
  const response = await stub.fetch(internalUrl.toString());

  const headers = new Headers(response.headers);
  const cors = corsHeaders(origin, allowed);
  if (cors !== undefined) {
    for (const [key, value] of Object.entries(cors)) {
      headers.set(key, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
});

app.get("/ws", async (c) => {
  const allowed = parseAllowedOrigins(c.env.ALLOWED_ORIGINS);
  const origin = c.req.header("Origin") ?? null;
  if (!isOriginAllowed(origin, allowed)) {
    return c.text("Forbidden", 403);
  }

  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.text("Expected WebSocket upgrade", 426);
  }

  const metric = parseMetric(c.req.query("type"));
  if (metric === null) {
    return c.json({ error: "invalid metric" }, { status: 400 });
  }

  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  if (!checkConnectionRateLimit(ip)) {
    return c.text("Too Many Requests", 429);
  }

  const stub = c.env.GLOBAL_LEADERBOARD.get(
    c.env.GLOBAL_LEADERBOARD.idFromName(metricToDoId(metric)),
  );
  const internalUrl = new URL("http://internal/ws");
  internalUrl.searchParams.set("metric", metric);
  const upgradeRequest = new Request(internalUrl.toString(), {
    headers: c.req.raw.headers,
  });
  return await stub.fetch(upgradeRequest);
});

export default app;
