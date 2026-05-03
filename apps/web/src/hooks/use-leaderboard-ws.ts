import { useEffect, useMemo, useState } from "react";

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

  // Keep a stable reference to the WebSocket so React can reconnect
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsRef = useMemo<{ current: WebSocket | null }>(() => ({ current: null }), []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let backoff = 1000; // 1s
    let cancelled = false;

    const connect = () => {
      // Connect to the DO WebSocket endpoint
      try {
        ws = new WebSocket("/ws/leaderboard");
      } catch {
        ws = null;
      }
      if (!ws) {
        if (!cancelled) {
          setTimeout(connect, backoff);
          backoff = Math.min(30000, backoff * 2);
        }
        return;
      }

      ws.onopen = () => {
        setIsConnected(true);
        backoff = 1000;
        // Subscribe to a given range
        ws?.send(JSON.stringify({ type: "SUBSCRIBE", range: slotRange }));
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
        setTimeout(connect, backoff);
        backoff = Math.min(30000, backoff * 2);
      };
      ws.onerror = () => {
        ws?.close();
      };
      wsRef.current = ws;
    };

    connect();
    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [slotRange]);

  return { entries, isConnected, lastUpdated };
}
