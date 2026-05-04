import { useEffect, useState } from "react";
import { wsUrl } from "#/lib/api";

type LeaderboardEntry = {
  playerId: number;
  username: string;
  platform: string;
  internalElo: number;
  internalMatches: number;
  discordUserId?: string | null;
};

type UseLeaderboardWSResult = {
  entries: LeaderboardEntry[];
  isConnected: boolean;
  lastUpdated: number | null;
};

export default function useLeaderboardWS(
  slotRange: [number, number] = [1, 100],
): UseLeaderboardWSResult {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [rangeStart, rangeEnd] = slotRange;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let backoff = 1000;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (ws) {
        try {
          ws.close();
        } catch {}
        ws = null;
      }

      // Connect to the DO WebSocket endpoint
      try {
        ws = new WebSocket(wsUrl("/ws/leaderboard"));
      } catch {
        ws = null;
      }
      if (!ws) {
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, backoff);
          backoff = Math.min(30000, backoff * 2);
        }
        return;
      }

      ws.onopen = () => {
        setIsConnected(true);
        backoff = 1000;
        // Subscribe to a given range
        ws?.send(JSON.stringify({ type: "SUBSCRIBE", range: [rangeStart, rangeEnd] }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse((ev?.data ?? "") as string);
          if (msg?.type === "LEADERBOARD_SNAPSHOT" || msg?.type === "LEADERBOARD_UPDATE") {
            const data = Array.isArray(msg?.data) ? (msg.data as LeaderboardEntry[]) : [];
            setEntries(data);
            setLastUpdated(Date.now());
          }
        } catch {
          // ignore invalid messages
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        setIsConnected(false);
        ws = null;
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(30000, backoff * 2);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      ws?.close();
    };
  }, [rangeStart, rangeEnd]);

  return { entries, isConnected, lastUpdated };
}
