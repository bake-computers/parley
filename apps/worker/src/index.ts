import {
  axiomMiddleware,
  createRuntimeLogSink,
  type AxiomEnv,
  type AxiomVariables,
} from "@parley/axiom";
import { configureLogSink, resetLogSink, type DiscordRuntimeEnv } from "@parley/runtime";
import type { Fetcher, R2Bucket } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { createApp } from "#/app";
import { serveTournamentQr } from "#/interactions/tournament/qr";

type Bindings = DiscordRuntimeEnv &
  AxiomEnv & {
    VPC_SERVICE: Fetcher;
    ENGINE_SERVICE_URL: string;
    ENGINE_INTERNAL_URL: string;
    PARLEY_CDN?: R2Bucket;
  };

const app = new Hono<{ Bindings: Bindings; Variables: AxiomVariables }>();

app.use("*", axiomMiddleware("worker"));

app.get("/qr/:objectName", async (c) => {
  if (!c.env.PARLEY_CDN) {
    return c.text("QR storage is not configured", 503);
  }
  return serveTournamentQr(c.env.PARLEY_CDN, c.req.param("objectName"));
});

app.all("*", async (c) => {
  const axiom = c.get("axiom");
  configureLogSink(createRuntimeLogSink(axiom));

  try {
    const bot = createApp();
    return await bot.fetch(c.req.raw, c.env, c.executionCtx);
  } finally {
    resetLogSink();
  }
});

export default app;
