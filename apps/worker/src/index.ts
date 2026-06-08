import { axiomMiddleware, type AxiomEnv } from "@parley/axiom";
import type { DiscordRuntimeEnv } from "@parley/runtime";
import { Hono } from "hono";
import { createApp } from "./app.js";

type Bindings = DiscordRuntimeEnv &
  AxiomEnv & {
    ENGINE_SERVICE_URL: string;
  };

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", axiomMiddleware("worker"));

app.all("*", (c) => {
  const bot = createApp();
  return bot.fetch(c.req.raw, c.env, c.executionCtx);
});

export default app;
