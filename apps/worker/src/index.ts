import {
  axiomMiddleware,
  createRuntimeLogSink,
  type AxiomEnv,
  type AxiomVariables,
} from "@parley/axiom";
import { runWithLogSink, type DiscordRuntimeEnv } from "@parley/runtime";
import type { Fetcher } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { createApp } from "#/app";
import { requestContext } from "#/request-context";

type Bindings = DiscordRuntimeEnv &
  AxiomEnv & {
    VPC_SERVICE: Fetcher;
    ENGINE_INTERNAL_URL: string;
  };

const app = new Hono<{ Bindings: Bindings; Variables: AxiomVariables }>();

app.use("*", axiomMiddleware("worker"));

app.all("*", async (c) => {
  const axiom = c.get("axiom");
  // Per-request sink bound to this request's async context (ALS): concurrent
  // isolates never share a process-global sink, and terminal emits hand their
  // flush to the execution context so the ingest POST is covered by waitUntil.
  const logSink = createRuntimeLogSink(axiom, (promise) => c.executionCtx.waitUntil(promise));

  const bot = createApp();
  // Expose the wide event's request_id so engine RPCs forward X-Request-ID.
  return requestContext.run(
    { requestId: axiom.requestId ?? crypto.randomUUID() },
    () => runWithLogSink(logSink, () => bot.fetch(c.req.raw, c.env, c.executionCtx)),
  );
});

export default app;
