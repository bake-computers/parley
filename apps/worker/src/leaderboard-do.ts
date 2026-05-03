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

  // In-memory cache of the top-leaderboard for quick broadcasts
  private cache: LeaderboardEntry[] = [];
  private cacheTs: number = 0;

  // Connected WebSocket clients (server-end objects)
  private clients: Set<any> = new Set();

  // Per-connection state attachments (e.g. subscription ranges)
  // We serialize small attachment objects to strings for storage alongside a WS.
  // Using the WebSocket object itself as the key is sufficient in this skeleton.

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

    // WebSocket upgrade path. Use the standard WebSocketPair approach when available.
    // This upgrade enables real-time broadcasts to all connected clients.
    if (
      request.headers.get("Upgrade")?.toLowerCase() === "websocket" ||
      request.headers.get("Sec-WebSocket-Key")
    ) {
      // Attempt to upgrade using WebSocketPair (Cloudflare Workers environment).
      try {
        const pair = (globalThis as any).WebSocketPair;
        if (!pair) {
          // Fallback: indicate that WebSocket upgrade isn't available in this runtime.
          return new Response("WebSocket upgrade not available in this environment", {
            status: 501,
          });
        }

        // In Cloudflare, WebSocketPair is a small class returning two endpoints
        const wp = new (globalThis as any).WebSocketPair();
        const clientWs: any = wp[0];
        const serverWs: any = wp[1];

        // Attach handlers on the server end to receive messages and close events
        serverWs.onmessage = (evt: any) => this.webSocketMessage(serverWs, evt?.data ?? evt);
        serverWs.onclose = () => this.webSocketClose(serverWs);
        serverWs.onerror = () => this.webSocketClose(serverWs);

        // Track this connection
        this.clients.add(serverWs);

        // Send initial snapshot to client after connect
        if (typeof clientWs.send === "function") {
          clientWs.send(JSON.stringify({ type: "LEADERBOARD_SNAPSHOT", data: this.cache }));
        }

        // Return the client endpoint for the browser to finalize the WS handshake
        return new Response(null, { status: 101, webSocket: clientWs });
      } catch (e) {
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
    // Try to load from DB if available; otherwise keep existing cache (empty for cold start).
    this.cache = [];
    this.cacheTs = now;
    try {
      // Best-effort: if a DB binding exists with a query method, fetch the top 500 players.
      const db: any = (this.env as any).db;
      if (db) {
        const top = await (db?.listGlobalLeaderboardPage as any)?.({
          platform: "all",
          minMatches: 0,
          limit: 500,
          offset: 0,
        });
        if (Array.isArray(top)) {
          // Map to LeaderboardEntry shape as defined in core/types
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
      // Ignore DB fetch errors in hot-path; rely on existing cache if available.
    }
  }

  // Periodic refresh hook. Trigger a cache refresh and broadcast to all connected clients.
  alarm(): void {
    void this.refreshAndBroadcast();
  }

  // Handle incoming WebSocket messages from clients
  webSocketMessage(_ws: any, message: any): void {
    try {
      const data = typeof message === "string" ? JSON.parse(message) : message;
      if (!data) return;
      if (data.type === "SUBSCRIBE" && Array.isArray(data.range)) {
        // Store per-connection subscription range for potential future filtering
        (_ws as any).__attachment = this.serializeAttachment({
          range: data.range as [number, number],
        });
        // Attach an in-memory range so we can reuse in broadcasts if needed
        this.clients.forEach((ws) => {
          if (ws === _ws) {
            (ws as any).__attachment = (_ws as any).__attachment;
          }
        });
      }
    } catch {
      // Ignore invalid messages
    }
  }

  webSocketClose(_ws: any): void {
    // Remove the closed socket from the set
    this.clients.delete(_ws);
  }

  // Helper to serialize per-connection attachment/state
  private serializeAttachment(attachment: { range?: [number, number] }): string {
    return JSON.stringify(attachment);
  }

  // Refresh cache from DB and broadcast the updated data to all connected clients
  private async refreshAndBroadcast(): Promise<void> {
    await this.ensureCache();
    const update = { type: "LEADERBOARD_UPDATE", data: this.cache, timestamp: Date.now() };
    for (const ws of Array.from(this.clients)) {
      try {
        ws.send?.(JSON.stringify(update));
      } catch {
        // Ignore failed broadcasts
        this.clients.delete(ws);
      }
    }
  }
}

export type { LeaderboardEntry };
