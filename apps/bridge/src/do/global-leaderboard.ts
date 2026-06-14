import { createAxiomLogger } from "@parley/axiom";
import { DurableObject } from "cloudflare:workers";
import { fetchLeaderboard } from "../engine.js";
import { resolveEngineTransport } from "../engine-transport.js";
import { hashEntries, shouldBroadcast } from "../hash.js";
import type { Env, LeaderboardMetric, LeaderboardSnapshot, WireMessage } from "../types.js";
import { emptySnapshot, parseMetric, toWireMessage } from "../types.js";

const SNAPSHOT_KEY = "snapshot";
const DEFAULT_POLL_MS = 60_000;

export class GlobalLeaderboard extends DurableObject<Env> {
  private snapshot: LeaderboardSnapshot | null = null;
  private metric: LeaderboardMetric | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<LeaderboardSnapshot>(SNAPSHOT_KEY);
      if (stored) {
        this.snapshot = stored;
        this.metric = stored.metric;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const metric = parseMetric(url.searchParams.get("metric"));
    if (metric === null) {
      return Response.json({ error: "invalid metric" }, { status: 400 });
    }
    this.metric = metric;

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      const snapshot = await this.getSnapshot(metric);
      server.send(JSON.stringify(toWireMessage("snapshot", snapshot)));
      await this.ensureAlarm();
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "GET") {
      const snapshot = await this.getSnapshot(metric);
      return Response.json(toWireMessage("snapshot", snapshot), {
        headers: { "Cache-Control": "public, max-age=15" },
      });
    }

    return new Response("Not Found", { status: 404 });
  }

  async alarm(): Promise<void> {
    const logger = createAxiomLogger(this.env, "bridge");
    try {
      if (this.metric !== null) {
        await this.refresh(this.metric, false, logger);
      }
      await this.scheduleNextAlarm();
    } finally {
      this.ctx.waitUntil(logger.flush());
    }
  }

  private async getSnapshot(metric: LeaderboardMetric): Promise<LeaderboardSnapshot> {
    if (this.snapshot === null || this.snapshot.metric !== metric) {
      const logger = createAxiomLogger(this.env, "bridge");
      try {
        await this.refresh(metric, true, logger);
      } finally {
        this.ctx.waitUntil(logger.flush());
      }
    }
    return this.snapshot ?? emptySnapshot(metric);
  }

  private async ensureAlarm(): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null) {
      await this.scheduleNextAlarm();
    }
    if (this.metric !== null && this.snapshot === null) {
      const logger = createAxiomLogger(this.env, "bridge");
      try {
        await this.refresh(this.metric, true, logger);
      } finally {
        this.ctx.waitUntil(logger.flush());
      }
    }
  }

  private async scheduleNextAlarm(): Promise<void> {
    const configured = Number(this.env.POLL_INTERVAL_MS);
    const interval = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_POLL_MS;
    await this.ctx.storage.setAlarm(Date.now() + interval);
  }

  private async refresh(
    metric: LeaderboardMetric,
    force: boolean,
    logger: ReturnType<typeof createAxiomLogger>,
  ): Promise<void> {
    const previousHash = this.snapshot?.hash ?? "";
    const start = Date.now();

    try {
      const { entries, totalCount } = await fetchLeaderboard(
        resolveEngineTransport(this.env),
        metric,
      );
      const hash = await hashEntries(entries);
      const nextSnapshot: LeaderboardSnapshot = {
        metric,
        hash,
        updatedAt: Date.now(),
        totalCount,
        entries,
      };

      if (shouldBroadcast(previousHash, hash, force)) {
        this.snapshot = nextSnapshot;
        await this.ctx.storage.put(SNAPSHOT_KEY, nextSnapshot);
        if (!force && previousHash.length > 0) {
          this.broadcast(toWireMessage("update", nextSnapshot), logger, metric);
        }
        logger.logDo({
          action: force ? "refresh_forced" : "refresh_broadcast",
          metric,
          duration_ms: Date.now() - start,
          entry_count: entries.length,
        });
      } else if (this.snapshot === null) {
        this.snapshot = nextSnapshot;
        await this.ctx.storage.put(SNAPSHOT_KEY, nextSnapshot);
        logger.logDo({
          action: "refresh_initialized",
          metric,
          duration_ms: Date.now() - start,
          entry_count: entries.length,
        });
      } else {
        logger.logDo({
          action: "refresh_unchanged",
          metric,
          duration_ms: Date.now() - start,
          entry_count: entries.length,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.logDo({
        action: "refresh_failed",
        metric,
        duration_ms: Date.now() - start,
        error: message,
      });
      if (this.snapshot === null) {
        this.snapshot = emptySnapshot(metric);
      }
    }
  }

  private broadcast(
    message: WireMessage,
    logger: ReturnType<typeof createAxiomLogger>,
    metric: LeaderboardMetric,
  ): void {
    const payload = JSON.stringify(message);
    const sockets = this.ctx.getWebSockets();
    let delivered = 0;

    for (const socket of sockets) {
      try {
        socket.send(payload);
        delivered += 1;
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        logger.logDo({
          action: "broadcast_failed",
          metric,
          error: errMessage,
        });
      }
    }

    logger.logWs({
      action: "broadcast",
      metric,
      connection_count: delivered,
    });
  }
}
