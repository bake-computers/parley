import { DurableObject } from "cloudflare:workers";
import { fetchLeaderboard } from "../engine.js";
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
    if (this.metric !== null) {
      await this.refresh(this.metric, false);
    }
    await this.scheduleNextAlarm();
  }

  private async getSnapshot(metric: LeaderboardMetric): Promise<LeaderboardSnapshot> {
    if (this.snapshot === null || this.snapshot.metric !== metric) {
      await this.refresh(metric, true);
    }
    return this.snapshot ?? emptySnapshot(metric);
  }

  private async ensureAlarm(): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null) {
      await this.scheduleNextAlarm();
    }
    if (this.metric !== null && this.snapshot === null) {
      await this.refresh(this.metric, true);
    }
  }

  private async scheduleNextAlarm(): Promise<void> {
    const configured = Number(this.env.POLL_INTERVAL_MS);
    const interval = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_POLL_MS;
    await this.ctx.storage.setAlarm(Date.now() + interval);
  }

  private async refresh(metric: LeaderboardMetric, force: boolean): Promise<void> {
    const previousHash = this.snapshot?.hash ?? "";

    try {
      const { entries, totalCount } = await fetchLeaderboard(this.env.ENGINE_SERVICE_URL, metric);
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
          this.broadcast(toWireMessage("update", nextSnapshot));
        }
      } else if (this.snapshot === null) {
        this.snapshot = nextSnapshot;
        await this.ctx.storage.put(SNAPSHOT_KEY, nextSnapshot);
      }
    } catch (error) {
      console.error("leaderboard refresh failed", error);
      if (this.snapshot === null) {
        this.snapshot = emptySnapshot(metric);
      }
    }
  }

  private broadcast(message: WireMessage): void {
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch (error) {
        console.error("leaderboard broadcast failed", error);
      }
    }
  }
}
