import type { Context, MiddlewareHandler } from "hono";
import type { PipelineEnv } from "#/config";
import { resolvePipelineConfig } from "#/config";
import { EventLogger } from "#/logger";

export type EventVariables = {
  events: EventLogger;
};

function extractClientIp(c: Context): string | undefined {
  return (
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    c.req.header("X-Real-IP") ??
    undefined
  );
}

export function createEventLogger(env: PipelineEnv, fallbackService: string): EventLogger {
  return new EventLogger(resolvePipelineConfig(env, fallbackService));
}

function outcomeForStatus(status: number): "success" | "client_error" | "error" {
  if (status >= 500) {
    return "error";
  }
  if (status >= 400) {
    return "client_error";
  }
  return "success";
}

/**
 * One wide event per request hop. begin() with method/path/request_id/env in
 * the request path; finish()+flush() in finally UNLESS the runtime owns the
 * emit (Discord interaction POST that returned 200/204 — processing continues
 * in waitUntil, so the runtime sink finishes).
 */
export function eventMiddleware(
  fallbackService: string,
): MiddlewareHandler<{ Bindings: PipelineEnv; Variables: EventVariables }> {
  return async (c, next) => {
    const logger = createEventLogger(c.env, fallbackService);
    c.set("events", logger);

    const cf = (c.req.raw as Request & { cf?: { colo?: string; country?: string } }).cf;
    const clientIp = extractClientIp(c);
    const userAgent = c.req.header("User-Agent");
    logger.begin({
      request_id: c.req.header("cf-ray") ?? c.req.header("x-request-id") ?? crypto.randomUUID(),
      http: {
        method: c.req.method,
        path: c.req.path,
        ...(userAgent ? { user_agent: userAgent } : {}),
        ...(clientIp ? { client_ip: clientIp } : {}),
      },
      env: {
        ...(cf?.colo ? { colo: cf.colo } : {}),
        ...(cf?.country ? { country: cf.country } : {}),
      },
    });

    const start = Date.now();
    let error: unknown;

    try {
      await next();
    } catch (caught) {
      error = caught;
      throw caught;
    } finally {
      const status = error === undefined ? c.res.status : 500;
      const contentLength = c.res.headers.get("Content-Length");
      logger.merge({
        http: {
          status,
          ...(contentLength ? { bytes_out: Number(contentLength) } : {}),
        },
        duration_ms: Date.now() - start,
        outcome: outcomeForStatus(status),
        ...(error !== undefined
          ? { error: { message: error instanceof Error ? error.message : String(error) } }
          : {}),
      });

      const runtimeOwnsEmit =
        (c.req.path === "/interactions" || c.req.path === "/") &&
        c.req.method === "POST" &&
        (status === 200 || status === 204);

      if (!runtimeOwnsEmit) {
        logger.finish();
        c.executionCtx.waitUntil(logger.flush());
      } else {
        // The runtime owns the emit for interaction POSTs: it always finishes
        // (ping / invalid / empty_response / completed terminal sink
        // finish+flush). Never finish() here — a half-empty fallback would
        // freeze the event identity before the terminal record lands. If the
        // runtime never finishes, the event is lost, which is acceptable vs
        // finishing early with the wrong identity.
        c.executionCtx.waitUntil(logger.whenFinished.then(() => logger.flush()));
      }
    }
  };
}

export async function withEventFlush(
  logger: EventLogger,
  ctx: Pick<ExecutionContext, "waitUntil">,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.merge({ outcome: "error", error: { message } });
    throw error;
  } finally {
    logger.finish();
    ctx.waitUntil(logger.flush());
  }
}
