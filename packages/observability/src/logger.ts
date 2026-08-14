import { type PipelineConfig, isPipelineConfigured } from "#/config";
import type { StandaloneEvent, WideEvent } from "#/events";

/** Fields that can be merged into the in-flight wide event. Nested groups are partial. */
export type WideEventMerge = {
  event?: string;
  message?: string;
  where?: string;
  request_id?: string;
  outcome?: WideEvent["outcome"];
  duration_ms?: number;
  http?: Partial<WideEvent["http"]>;
  discord?: Partial<WideEvent["discord"]>;
  db?: Partial<WideEvent["db"]>;
  matchmaking?: Partial<WideEvent["matchmaking"]>;
  env?: Partial<WideEvent["env"]>;
  error?: Partial<WideEvent["error"]>;
};

const OUTCOME_RANK: Record<WideEvent["outcome"], number> = {
  success: 0,
  client_error: 1,
  error: 2,
};

function formatDuration(ms: number): string {
  return `${ms.toFixed(1)}ms`;
}

/**
 * Builds exactly one context-rich JSON event per request hop.
 *
 * begin()/merge()/finish() track the current request event; finish() enqueues
 * it once. emitStandalone() covers unscoped logs (startup, registration).
 */
export class EventLogger {
  private readonly config: PipelineConfig;
  private readonly pending: Array<WideEvent | StandaloneEvent> = [];
  private current: WideEvent | undefined;
  private finished = false;
  private inflight: Promise<void> | undefined;
  private finishWaiters: Array<() => void> | undefined;

  constructor(config: PipelineConfig) {
    this.config = config;
  }

  get service(): string {
    return this.config.service;
  }

  get configured(): boolean {
    return isPipelineConfigured(this.config);
  }

  /** Request id of the in-flight event (forwarded as X-Request-ID to the engine). */
  get requestId(): string | undefined {
    return this.current?.request_id;
  }

  get hasCurrent(): boolean {
    return this.current !== undefined;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** Resolves once finish() has been called; resolves immediately if already finished. */
  get whenFinished(): Promise<void> {
    if (this.finished) {
      return Promise.resolve();
    }
    this.finishWaiters ??= [];
    return new Promise((resolve) => this.finishWaiters!.push(resolve));
  }

  /** Start the current request event (service, http method/path, request_id, env). */
  begin(partial: {
    request_id: string;
    http?: { method: string; path: string; user_agent?: string; client_ip?: string };
    env?: { colo?: string; country?: string; hostname?: string };
  }): void {
    this.current = {
      ts: new Date().toISOString(),
      level: "info",
      event: "request.completed",
      message: "",
      service: this.config.service,
      where: "",
      request_id: partial.request_id,
      outcome: "success",
      duration_ms: 0,
      ...(partial.http ? { http: { ...partial.http } } : {}),
      ...(partial.env ? { env: { ...partial.env } } : {}),
    };
    this.finished = false;
  }

  /**
   * Enrich the current event in place. Last error wins; outcome can only
   * escalate (success → client_error → error), never downgrade. Does not emit.
   */
  merge(fields: WideEventMerge): void {
    const cur = this.current;
    if (!cur) {
      return;
    }
    // Terminal finish freezes the event identity: a late merge (e.g. the
    // runtime ack arriving after discord.interaction.completed) must not
    // overwrite event/message/where/discord. http/outcome/error/duration stay
    // live so the middleware can still attach status for 401/204 hops.
    if (!this.finished) {
      if (fields.event !== undefined) {
        cur.event = fields.event;
      }
      if (fields.message !== undefined && fields.message !== "") {
        cur.message = fields.message;
      }
      if (fields.where !== undefined && fields.where !== "") {
        cur.where = fields.where;
      }
      if (fields.request_id !== undefined) {
        cur.request_id = fields.request_id;
      }
      if (fields.discord) {
        cur.discord = { ...cur.discord, ...fields.discord };
      }
    }
    if (fields.duration_ms !== undefined) {
      cur.duration_ms = fields.duration_ms;
    }
    if (fields.http) {
      cur.http = { ...cur.http, ...fields.http };
    }
    if (fields.db) {
      cur.db = { ...cur.db, ...fields.db };
    }
    if (fields.matchmaking) {
      cur.matchmaking = { ...cur.matchmaking, ...fields.matchmaking };
    }
    if (fields.env) {
      cur.env = { ...cur.env, ...fields.env };
    }
    if (fields.error) {
      cur.error = { ...fields.error };
    }
    if (fields.outcome !== undefined && OUTCOME_RANK[fields.outcome] >= OUTCOME_RANK[cur.outcome]) {
      cur.outcome = fields.outcome;
      cur.level = fields.outcome === "error" ? "error" : "info";
    }
  }

  /** Enqueue exactly one event for the current request. Idempotent. */
  finish(): void {
    if (!this.current || this.finished) {
      return;
    }
    const cur = this.current;
    if (cur.message === "") {
      if (cur.http?.status !== undefined) {
        cur.message = `${cur.http.method} ${cur.http.path} ${cur.http.status} (${formatDuration(cur.duration_ms)})`;
      } else if (cur.discord?.name) {
        const failed = cur.outcome !== "success";
        cur.message = `${cur.discord.surface ?? "discord"} ${cur.discord.name} ${failed ? "failed" : "completed"}`;
      } else {
        cur.message = "request completed";
      }
    }
    if (cur.where === "") {
      if (cur.http) {
        cur.where = `${cur.service} ${cur.http.method} ${cur.http.path}`;
      } else if (cur.discord?.name) {
        cur.where = `${cur.service} ${cur.discord.surface ?? "discord"} ${cur.discord.name}`;
      } else {
        cur.where = cur.service;
      }
    }
    cur.level = cur.outcome === "error" ? "error" : "info";
    this.enqueue(cur);
    this.finished = true;
    if (this.finishWaiters) {
      const waiters = this.finishWaiters;
      this.finishWaiters = undefined;
      for (const resolve of waiters) {
        resolve();
      }
    }
  }

  /** Emit a standalone record when there is no in-flight request (startup/registration). */
  emitStandalone(record: {
    ts?: string;
    level?: "info" | "error";
    event: string;
    message: string;
    where?: string;
    request_id?: string;
    error?: { type?: string; message?: string; code?: string };
  }): void {
    this.enqueue({
      ts: record.ts ?? new Date().toISOString(),
      level: record.level ?? "info",
      event: record.event,
      message: record.message,
      service: this.config.service,
      ...(record.where ? { where: record.where } : {}),
      ...(record.request_id ? { request_id: record.request_id } : {}),
      ...(record.error ? { error: record.error } : {}),
    });
  }

  private enqueue(event: WideEvent | StandaloneEvent): void {
    if (!this.configured) {
      console.log(JSON.stringify(event));
      return;
    }
    this.pending.push(event);
  }

  async flush(): Promise<void> {
    if (!this.configured) {
      this.pending.length = 0;
      return;
    }

    const events = this.pending.splice(0);
    if (events.length === 0) {
      // Nothing new to send, but a flush may already be in flight (terminal
      // sink finish+flush while the response is still being handled): resolve
      // only after the actual stream send so waitUntil covers the wire.
      if (this.inflight) {
        return this.inflight;
      }
      return;
    }

    if (this.inflight) {
      await this.inflight;
    }

    const run = (async () => {
      // Defer serialization by one macrotask so late merges land before the
      // wire snapshot: the runtime sink may finish()+flush() while the response
      // is still in flight (bad-signature 401, empty-response 204) and the
      // middleware finally merges http.status right after.
      await new Promise((resolve) => setTimeout(resolve, 0));

      try {
        await this.config.stream!.send(events);
      } catch (error) {
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "pipelines.ingest_failed",
            count: events.length,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    })();

    this.inflight = run;
    try {
      await run;
    } finally {
      if (this.inflight === run) {
        this.inflight = undefined;
      }
    }
  }
}
