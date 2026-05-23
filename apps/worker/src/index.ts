import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

import { StatsService, StatsPlatform } from "@parley/proto";
import ocrTestRoutes from "./ocr-test.js";

type Bindings = {
  ENGINE_SERVICE_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors());

app.get("/health", (c) => c.text("OK"));

function createStatsClient(baseUrl: string) {
  const transport = createConnectTransport({
    baseUrl,
    jsonOptions: { enumAsInteger: true },
    fetch(input, init) {
      const { redirect: _redirect, ...rest } = init ?? {};
      return globalThis.fetch(input, { ...rest, redirect: "follow" });
    },
  });
  return createClient(StatsService, transport);
}

function parsePlatform(raw: string): StatsPlatform {
  const map: Record<string, StatsPlatform> = {
    auto: StatsPlatform.AUTO,
    pc: StatsPlatform.PC,
    xbox: StatsPlatform.XBOX,
    playstation: StatsPlatform.PLAYSTATION,
  };
  return map[raw.toLowerCase()] ?? StatsPlatform.AUTO;
}

function connectErrorResponse(err: unknown) {
  if (err instanceof ConnectError) {
    return Response.json(
      { error: err.message, code: err.code },
      { status: err.code === Code.NotFound ? 404 : 502 },
    );
  }
  return Response.json({ error: "Internal error" }, { status: 500 });
}

app.get("/stats/:username", async (c) => {
  const { username } = c.req.param();
  const platform = parsePlatform(c.req.query("platform") ?? "auto");
  const season = c.req.query("season") ?? "";

  // Check edge cache first — avoids the 3s+ upstream fetch for repeat lookups.
  const cache = caches.default;
  const cacheKey = new Request(new URL(c.req.url), c.req.raw);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const client = createStatsClient(c.env.ENGINE_SERVICE_URL);
    const result = await client.fetchStats({
      username,
      platform,
      seasonSelector: season,
    });
    const response = c.json(result);
    response.headers.set(
      "Cache-Control",
      "public, max-age=60, s-maxage=60, stale-while-revalidate=120",
    );
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return connectErrorResponse(err);
  }
});

app.get("/stats/:username/collection", async (c) => {
  const { username } = c.req.param();
  const platform = parsePlatform(c.req.query("platform") ?? "auto");

  // Check edge cache first — collections are heavier, so cache longer.
  const cache = caches.default;
  const cacheKey = new Request(new URL(c.req.url), c.req.raw);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const client = createStatsClient(c.env.ENGINE_SERVICE_URL);
    const result = await client.fetchStatsCollection({
      username,
      platform,
    });
    const response = c.json(result);
    response.headers.set(
      "Cache-Control",
      "public, max-age=120, s-maxage=120, stale-while-revalidate=300",
    );
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return connectErrorResponse(err);
  }
});

app.route("/ocr", ocrTestRoutes);

app.all("*", (c) => c.text("Not Found", 404));

export default app;
