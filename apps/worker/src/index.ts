import { Hono } from "hono";
import { createApp } from "./app.js";
import type { DiscordRuntimeEnv } from "@parley/runtime";

type Bindings = DiscordRuntimeEnv & {
  ENGINE_SERVICE_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.all("*", (c) => {
  const bot = createApp();
  return bot.fetch(c.req.raw, c.env, c.executionCtx);
});

export default app;
