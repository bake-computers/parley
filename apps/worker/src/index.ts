import {
  axiomMiddleware,
  createRuntimeLogSink,
  type AxiomEnv,
  type AxiomVariables,
} from "@parley/axiom";
import { configureLogSink, resetLogSink, type DiscordRuntimeEnv } from "@parley/runtime";
import type { Fetcher, KVNamespace } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { createApp } from "./app.js";
import { handleDispatch } from "./notifications/dispatch.js";

type Bindings = DiscordRuntimeEnv &
  AxiomEnv & {
    KV: KVNamespace;
    VPC_SERVICE: Fetcher;
    ENGINE_SERVICE_URL: string;
    ENGINE_INTERNAL_URL: string;
    NOTIFY_WEBHOOK_SECRET: string;
  };

const app = new Hono<{ Bindings: Bindings; Variables: AxiomVariables }>();

app.use("*", axiomMiddleware("worker"));

// Internal dispatch endpoint for engine → worker notifications.
// Must be registered before the catch-all Discord handler.
app.post("/internal/notifications/dispatch", handleDispatch);

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