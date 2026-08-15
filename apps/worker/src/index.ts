import {
  eventMiddleware,
  createRuntimeLogSink,
  type EventVariables,
  type PipelineEnv,
} from "@parley/observability";
import { runWithLogSink, type DiscordRuntimeEnv } from "@parley/runtime";
import type { Fetcher } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { createApp } from "#/app";
import { requestContext } from "#/request-context";

type Bindings = DiscordRuntimeEnv &
  PipelineEnv & {
    VPC_SERVICE: Fetcher;
    ENGINE_INTERNAL_URL: string;
  };

const app = new Hono<{ Bindings: Bindings; Variables: EventVariables }>();

app.use("*", eventMiddleware("worker"));

app.all("*", async (c) => {
  const events = c.get("events");
  // Per-request sink bound to this request's async context (ALS): concurrent
  // isolates never share a process-global sink, and terminal emits hand their
  // flush to the execution context so the stream send is covered by waitUntil.
  const logSink = createRuntimeLogSink(events, (promise) => c.executionCtx.waitUntil(promise));

  const bot = createApp();
  // Expose the wide event's request_id so engine RPCs forward X-Request-ID.
  return requestContext.run(
    { requestId: events.requestId ?? crypto.randomUUID() },
    () => runWithLogSink(logSink, () => bot.fetch(c.req.raw, c.env, c.executionCtx)),
  );
});

export default app;
