import type { Context, MiddlewareHandler } from "hono";
import type { AxiomEnv } from "./config.js";
import { resolveAxiomConfig } from "./config.js";
import { AxiomLogger } from "./logger.js";

export type AxiomVariables = {
  axiom: AxiomLogger;
};

function extractClientIp(c: Context): string | undefined {
  return (
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    c.req.header("X-Real-IP") ??
    undefined
  );
}

export function createAxiomLogger(env: AxiomEnv, fallbackService: string): AxiomLogger {
  return new AxiomLogger(resolveAxiomConfig(env, fallbackService));
}

export function axiomMiddleware(
  fallbackService: string,
): MiddlewareHandler<{ Bindings: AxiomEnv; Variables: AxiomVariables }> {
  return async (c, next) => {
    const logger = createAxiomLogger(c.env, fallbackService);
    c.set("axiom", logger);

    const start = Date.now();
    let error: unknown;

    try {
      await next();
    } catch (caught) {
      error = caught;
      throw caught;
    } finally {
      const duration_ms = Date.now() - start;
      const status = error === undefined ? c.res.status : 500;

      const httpFields = {
        method: c.req.method,
        path: c.req.path,
        status,
        duration_ms,
      };
      const userAgent = c.req.header("User-Agent");
      const contentType = c.res.headers.get("Content-Type");
      const origin = extractClientIp(c);

      logger.logHttp({
        ...httpFields,
        ...(userAgent ? { user_agent: userAgent } : {}),
        ...(contentType ? { content_type: contentType } : {}),
        ...(origin ? { origin } : {}),
      });

      if (error !== undefined) {
        const message = error instanceof Error ? error.message : String(error);
        logger.logError("unhandled_exception", message, c.req.path);
      } else if (
        (c.req.path === "/interactions" || c.req.path === "/") &&
        c.req.method === "POST" &&
        status === 204
      ) {
        logger.logError(
          "discord_empty_ack",
          "Discord interaction returned HTTP 204 with no callback payload",
          c.req.path,
        );
      }

      c.executionCtx.waitUntil(logger.flush());
    }
  };
}

export async function withAxiomFlush(
  logger: AxiomLogger,
  ctx: Pick<ExecutionContext, "waitUntil">,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.logError("operation_failed", message);
    throw error;
  } finally {
    ctx.waitUntil(logger.flush());
  }
}
