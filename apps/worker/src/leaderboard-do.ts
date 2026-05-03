import type { DurableObjectState, DurableObject } from "@cloudflare/workers-types";

type LeaderboardEntry = {
  playerId: number;
  username: string;
  platform: string;
  internalElo: number;
  internalMatches: number;
  discordUserId: string | null;
};

type LeaderboardEnv = {
  HYPERDRIVE?: any;
  db?: any;
};

export class LeaderboardDO implements DurableObject {
  private state: DurableObjectState;
  private env: LeaderboardEnv;
  private cache: LeaderboardEntry[] = [];
  private cacheTs: number = 0;
  private clients: Set<any> = new Set();

  constructor(state: DurableObjectState, env: LeaderboardEnv) {
    this.state = state;
    this.env = env ?? {};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async fetch(request: any): Promise<any> {
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

    if (
      request.headers.get("Upgrade")?.toLowerCase() === "websocket" ||
      request.headers.get("Sec-WebSocket-Key")
    ) {
      try {
        const pair = (globalThis as any).WebSocketPair;
        if (!pair) {
          return new Response("WebSocket upgrade not available in this environment", {
            status: 501,
          });
        }

        const wp = new (globalThis as any).WebSocketPair();
        const clientWs: any = wp[0];
        const serverWs: any = wp[1];

        serverWs.onmessage = (evt: any) => this.webSocketMessage(serverWs, evt?.data ?? evt);
        serverWs.onclose = () => this.webSocketClose(serverWs);
        serverWs.onerror = () => this.webSocketClose(serverWs);

        this.clients.add(serverWs);

        if (typeof clientWs.send === "function") {
          clientWs.send(JSON.stringify({ type: "LEADERBOARD_SNAPSHOT", data: this.cache }));
        }

        return new Response(null, { status: 101, webSocket: clientWs });
      } catch {
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
  }

  private async ensureCache(): Promise<void> {
    const now = Date.now();
    if (this.cache.length > 0 && now - this.cacheTs < 30000) {
      return;
    }
    this.cache = [];
    this.cacheTs = now;
    try {
      const db: any = (this.env as any).db;
      if (db) {
        const top = await (db?.listGlobalLeaderboardPage as any)?.({
          platform: "all",
          minMatches: 0,
          limit: 500,
          offset: 0,
        });
        if (Array.isArray(top)) {
          this.cache = top.map((e: any) => ({
            playerId: e.playerId,
            username: e.username,
            platform: e.platform,
            internalElo: e.internalElo,
            internalMatches: e.internalMatches,
            discordUserId: (e as any).discordUserId ?? null,
          }));
        }
      }
    } catch {
      // DB fetch failed - rely on existing cache
    }
  }

  alarm(): void {
    void this.refreshAndBroadcast();
  }

  webSocketMessage(_ws: any, message: any): void {
    try {
      const data = typeof message === "string" ? JSON.parse(message) : message;
      if (!data) return;
      if (data.type === "SUBSCRIBE" && Array.isArray(data.range)) {
        (_ws as any).__attachment = this.serializeAttachment({
          range: data.range as [number, number],
        });
        this.clients.forEach((ws) => {
          if (ws === _ws) {
            (ws as any).__attachment = (_ws as any).__attachment;
          }
        });
      }
    } catch {
      // Invalid message - ignore
    }
  }

  webSocketClose(_ws: any): void {
    this.clients.delete(_ws);
  }

  private serializeAttachment(attachment: { range?: [number, number] }): string {
    return JSON.stringify(attachment);
  }

  private async refreshAndBroadcast(): Promise<void> {
    await this.ensureCache();
    const update = { type: "LEADERBOARD_UPDATE", data: this.cache, timestamp: Date.now() };
    for (const ws of Array.from(this.clients)) {
      try {
        ws.send?.(JSON.stringify(update));
      } catch {
        // Broadcast failed - remove stale connection
        this.clients.delete(ws);
      }
    }
  }
}

export type { LeaderboardEntry };
