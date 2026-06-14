import type { AxiomEnv } from "@parley/axiom";

export const METRICS = ["rank_points", "elo", "win_rate"] as const;

export type LeaderboardMetric = (typeof METRICS)[number];

export interface WireEntry {
  rank: number;
  playerId: string;
  score: number;
}

export interface LeaderboardSnapshot {
  metric: LeaderboardMetric;
  hash: string;
  updatedAt: number;
  totalCount: number;
  entries: WireEntry[];
}

export type WireMessageType = "snapshot" | "update";

export interface WireMessage extends LeaderboardSnapshot {
  type: WireMessageType;
}

export interface Env extends AxiomEnv {
  GLOBAL_LEADERBOARD: DurableObjectNamespace;
  MATCH_KV: KVNamespace;
  ENGINE_SERVICE_URL: string;
  ALLOWED_ORIGINS: string;
  POLL_INTERVAL_MS: string;
}

export function metricToDoId(metric: LeaderboardMetric): string {
  return `r6:${metric}`;
}

export function parseMetric(value: string | null | undefined): LeaderboardMetric | null {
  if (value === null || value === undefined) {
    return null;
  }
  return METRICS.includes(value as LeaderboardMetric) ? (value as LeaderboardMetric) : null;
}

export function toWireMessage(type: WireMessageType, snapshot: LeaderboardSnapshot): WireMessage {
  return { type, ...snapshot };
}

export function emptySnapshot(metric: LeaderboardMetric): LeaderboardSnapshot {
  return {
    metric,
    hash: "",
    updatedAt: 0,
    totalCount: 0,
    entries: [],
  };
}
