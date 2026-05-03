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

  private clients: Map<string, any> = new Map();

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

    if (
      request.headers.get("Upgrade")?.toLowerCase() === "websocket" ||
      request.headers.get("Sec-WebSocket-Key")
    ) {
      return new Response("WebSocket upgrade not implemented in this skeleton", { status: 501 });
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
  }

  alarm(): void {}

  webSocketMessage(_ws: any, _message: any): void {}

  webSocketClose(_ws: any): void {}
}

export type { LeaderboardEntry };
