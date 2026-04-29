import type { ExecutionContext } from "@cloudflare/workers-types";
import { closeDb, connectDb, type DbConnection } from "@parley/db/client";
import { logger } from "@parley/core/logger";
import type { WorkerEnv, WorkerRuntimeEnv } from "./env";

interface RuntimeDbHandle {
  env: WorkerRuntimeEnv;
  close(): Promise<void>;
}

export async function createRuntimeDbHandle(env: WorkerEnv): Promise<RuntimeDbHandle> {
  let connection: DbConnection | null = null;

  try {
    connection = await connectDb(env.HYPERDRIVE.connectionString);
    return {
      env: {
        ...env,
        db: connection.db,
      },
      close: () => closeDb(connection),
    };
  } catch (error) {
    logger.error("db.connect.failed", "Failed to connect to Postgres via Hyperdrive", {
      error,
    });
    return {
      env: { ...env },
      close: async () => undefined,
    };
  }
}

export class ManagedExecutionContext {
  private pending = 0;
  private responseReturned = false;
  private closePromise: Promise<void> | null = null;

  constructor(
    private readonly executionContext: ExecutionContext,
    private readonly close: () => Promise<void>,
  ) {}

  get props() {
    return "props" in this.executionContext ? this.executionContext.props : {};
  }

  get cache() {
    return this.executionContext.cache;
  }

  waitUntil(promise: Promise<unknown>): void {
    this.pending += 1;
    const tracked = Promise.resolve(promise).finally(() => {
      this.pending -= 1;
      if (this.responseReturned && this.pending === 0) {
        this.executionContext.waitUntil(this.closeOnce());
      }
    });
    this.executionContext.waitUntil(tracked);
  }

  passThroughOnException(): void {
    if ("passThroughOnException" in this.executionContext) {
      this.executionContext.passThroughOnException();
    }
  }

  markResponseReturned(): void {
    this.responseReturned = true;
    if (this.pending === 0) {
      this.executionContext.waitUntil(this.closeOnce());
    }
  }

  private closeOnce(): Promise<void> {
    if (!this.closePromise) {
      this.closePromise = this.close().catch((error) => {
        logger.warn("db.close.failed", "Failed to close Postgres connection", {
          error,
        });
      });
    }

    return this.closePromise;
  }
}
