export const LEADERBOARD_METRICS = ["rank_points", "elo", "win_rate"] as const;

export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  score: number;
}

export interface LeaderboardSnapshot {
  type: "snapshot" | "update";
  metric: LeaderboardMetric;
  hash: string;
  updatedAt: number;
  totalCount: number;
  entries: LeaderboardEntry[];
}

export const METRIC_LABELS: Record<LeaderboardMetric, string> = {
  rank_points: "Rank Points",
  elo: "Elo",
  win_rate: "Win Rate",
};

export const BRIDGE_SNAPSHOT_PATH = "/api/bridge/snapshot";
export const BRIDGE_WS_PATH = "/api/bridge/ws";

export function toWebSocketUrl(path: string, metric: LeaderboardMetric): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}${path}`);
  url.searchParams.set("type", metric);
  return url.toString();
}

export function formatScore(metric: LeaderboardMetric, score: number): string {
  if (metric === "win_rate") {
    const normalized = score <= 1 ? score * 100 : score;
    return `${normalized.toFixed(1)}%`;
  }
  return Math.round(score).toLocaleString("en-US");
}

export function formatUpdatedAt(timestamp: number): string {
  if (timestamp <= 0) {
    return "—";
  }
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
