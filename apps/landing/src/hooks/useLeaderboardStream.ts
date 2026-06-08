import { useEffect, useState } from "react";
import {
  getBridgeBaseUrl,
  type LeaderboardMetric,
  type LeaderboardSnapshot,
  toWebSocketUrl,
} from "#/lib/leaderboard";

export type LeaderboardConnectionStatus = "loading" | "live" | "reconnecting" | "error";

interface LeaderboardStreamState {
  snapshot: LeaderboardSnapshot | null;
  status: LeaderboardConnectionStatus;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export function useLeaderboardStream(metric: LeaderboardMetric): LeaderboardStreamState {
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [status, setStatus] = useState<LeaderboardConnectionStatus>("loading");

  useEffect(() => {
    const bridgeBaseUrl = getBridgeBaseUrl();
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = INITIAL_BACKOFF_MS;

    const clearReconnectTimer = () => {
      if (reconnectTimer != null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const applySnapshot = (next: LeaderboardSnapshot) => {
      setSnapshot(next);
    };

    const connect = () => {
      if (cancelled) {
        return;
      }

      clearReconnectTimer();
      socket?.close();

      const wsUrl = toWebSocketUrl(bridgeBaseUrl, "/ws", metric);
      socket = new WebSocket(wsUrl);

      socket.addEventListener("open", () => {
        if (cancelled) {
          return;
        }
        backoff = INITIAL_BACKOFF_MS;
        setStatus("live");
      });

      socket.addEventListener("message", (event) => {
        if (cancelled) {
          return;
        }
        try {
          const parsed = JSON.parse(String(event.data)) as LeaderboardSnapshot;
          if (parsed.type === "snapshot" || parsed.type === "update") {
            applySnapshot(parsed);
          }
        } catch {
          setStatus("error");
        }
      });

      socket.addEventListener("close", () => {
        if (cancelled) {
          return;
        }
        setStatus("reconnecting");
        reconnectTimer = setTimeout(() => {
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
          connect();
        }, backoff);
      });

      socket.addEventListener("error", () => {
        if (!cancelled) {
          setStatus("error");
        }
      });
    };

    const bootstrap = async () => {
      setStatus("loading");
      try {
        const response = await fetch(`${bridgeBaseUrl}/snapshot?type=${metric}`);
        if (response.ok) {
          const parsed = (await response.json()) as LeaderboardSnapshot;
          applySnapshot(parsed);
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }

      if (!cancelled) {
        connect();
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      socket?.close();
    };
  }, [metric]);

  return { snapshot, status };
}
