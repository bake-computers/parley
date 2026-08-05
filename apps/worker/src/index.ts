import {
  axiomMiddleware,
  createRuntimeLogSink,
  type AxiomEnv,
  type AxiomVariables,
} from "@parley/axiom";
import { configureLogSink, resetLogSink, type DiscordRuntimeEnv } from "@parley/runtime";
import type { Fetcher } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { createApp } from "#/app";

type Bindings = DiscordRuntimeEnv &
  AxiomEnv & {
    VPC_SERVICE: Fetcher;
    ENGINE_SERVICE_URL: string;
    ENGINE_INTERNAL_URL: string;
  };

const app = new Hono<{ Bindings: Bindings; Variables: AxiomVariables }>();

app.use("*", axiomMiddleware("worker"));

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
