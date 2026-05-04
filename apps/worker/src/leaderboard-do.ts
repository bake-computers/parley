import type { DurableObjectState } from "@cloudflare/workers-types";
import { connectDb, type DbConnection, type DbClient } from "@parley/db/client";
import { listGlobalLeaderboardPage } from "@parley/db/leaderboard";

type LeaderboardEntry = {
  playerId: number;
  username: string;
  platform: string;
  internalElo: number;
  internalMatches: number;
  discordUserId: string | null;
};

type LeaderboardEnv = {
  HYPERDRIVE?: { connectionString?: string };
};

interface CFWebSocket {
  accept(): void;
  send(data: string | ArrayBufferLike | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
  addEventListener(event: "message", handler: (event: MessageEvent) => void): void;
  addEventListener(event: "close", handler: () => void): void;
  addEventListener(event: "error", handler: () => void): void;
}

interface WebSocketPair {
  0: CFWebSocket;
  1: CFWebSocket;
}

export class LeaderboardDO {
  private state: DurableObjectState;
  private env: LeaderboardEnv;
  private cache: LeaderboardEntry[] = [];
  private cacheTs: number = 0;
  private clients: Set<CFWebSocket> = new Set();
  private dbConnection: DbConnection | null = null;

  constructor(state: DurableObjectState, env: LeaderboardEnv) {
    this.state = state;
    this.env = env ?? {};
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/ping") {
        return new Response(JSON.stringify({ type: "LEADERBOARD_DO", ok: true, ts: Date.now() }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/notify" && request.method === "POST") {
        void this.refreshAndBroadcast();
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const upgradeHeader = request.headers.get("Upgrade")?.toLowerCase();
      const secWsKey = request.headers.get("Sec-WebSocket-Key");

      if (upgradeHeader === "websocket" || secWsKey) {
        try {
          const Pair = (globalThis as unknown as { WebSocketPair?: new () => WebSocketPair })
            .WebSocketPair;
          if (typeof Pair !== "function") {
            return new Response("WebSocket upgrade not available in this environment", {
              status: 501,
            });
          }

          const wp = new Pair();
          const clientWs = wp[0];
          const serverWs = wp[1];

          serverWs.addEventListener("message", (evt: MessageEvent) =>
            this.webSocketMessage(serverWs, evt.data),
          );
          serverWs.addEventListener("close", () => this.webSocketClose(serverWs));
          serverWs.addEventListener("error", () => this.webSocketClose(serverWs));

          serverWs.accept();
          this.clients.add(serverWs);

          void this.sendSnapshot(serverWs);

          return new Response(null, {
            status: 101,
            webSocket: clientWs as unknown as ResponseInit["webSocket"],
          });
        } catch (error) {
          console.error("[LeaderboardDO] WebSocket upgrade error:", error);
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
      }

      await this.ensureCache();

      const payload = {
        type: "LEADERBOARD",
        data: this.cache,
        timestamp: Date.now(),
      };
      return new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("[LeaderboardDO] fetch error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  private async ensureDbConnection(): Promise<DbClient | null> {
    if (this.dbConnection) {
      return this.dbConnection.db;
    }

    const connectionString = this.env.HYPERDRIVE?.connectionString;
    if (!connectionString) {
      console.error("[LeaderboardDO] No HYPERDRIVE connection string available");
      return null;
    }

    try {
      this.dbConnection = await connectDb(connectionString);
      return this.dbConnection.db;
    } catch (error) {
      console.error("[LeaderboardDO] Failed to connect to DB:", error);
      return null;
    }
  }

  private async ensureCache(): Promise<void> {
    const now = Date.now();
    if (this.cache.length > 0 && now - this.cacheTs < 30000) {
      return;
    }

    this.cache = [];
    this.cacheTs = now;

    try {
      const db = await this.ensureDbConnection();
      if (!db) return;

      const top = await listGlobalLeaderboardPage(db, {
        platform: "all",
        minMatches: 0,
        limit: 500,
        offset: 0,
      });

      this.cache = top.map((e) => ({
        playerId: e.playerId,
        username: e.username,
        platform: e.platform,
        internalElo: e.internalElo,
        internalMatches: e.internalMatches,
        discordUserId: e.discordUserId ?? null,
      }));
    } catch (error) {
      console.error("[LeaderboardDO] Failed to refresh cache:", error);
    }
  }

  alarm(): void {
    void this.refreshAndBroadcast();
  }

  webSocketMessage(_ws: CFWebSocket, message: unknown): void {
    try {
      const data = typeof message === "string" ? JSON.parse(message) : null;
      if (!data) return;
      if (data.type === "SUBSCRIBE" && Array.isArray(data.range)) {
        (_ws as unknown as { __attachment?: string }).__attachment = this.serializeAttachment({
          range: data.range as [number, number],
        });
      }
    } catch {}
  }

  webSocketClose(_ws: CFWebSocket): void {
    this.clients.delete(_ws);
  }

  private serializeAttachment(attachment: { range?: [number, number] }): string {
    return JSON.stringify(attachment);
  }

  private async sendSnapshot(ws: CFWebSocket): Promise<void> {
    await this.ensureCache();
    try {
      ws.send(JSON.stringify({ type: "LEADERBOARD_SNAPSHOT", data: this.cache }));
    } catch {
      this.clients.delete(ws);
    }
  }

  private async refreshAndBroadcast(): Promise<void> {
    await this.ensureCache();
    const update = { type: "LEADERBOARD_UPDATE", data: this.cache, timestamp: Date.now() };
    for (const ws of Array.from(this.clients)) {
      try {
        ws.send(JSON.stringify(update));
      } catch {
        this.clients.delete(ws);
      }
    }
  }
}

export type { LeaderboardEntry };
