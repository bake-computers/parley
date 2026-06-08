import { LeaderboardType } from "@parley/proto/leaderboard/v1/leaderboard_pb.js";
import type { LeaderboardMetric, WireEntry } from "./types.js";

const GAME_R6 = 1;
const LEADERBOARD_LIMIT = 100;

interface EngineLeaderboardEntry {
  playerId?: string;
  player_id?: string;
  username?: string;
  rank?: number | string;
  score?: number;
}

interface EngineLeaderboardResponse {
  entries?: EngineLeaderboardEntry[];
  totalCount?: number | string;
  total_count?: number | string;
}

function metricToProtoType(metric: LeaderboardMetric): LeaderboardType {
  switch (metric) {
    case "elo":
      return LeaderboardType.ELO;
    case "win_rate":
      return LeaderboardType.WIN_RATE;
    case "rank_points":
      return LeaderboardType.RANK_POINTS;
  }
}

function toWireEntry(entry: EngineLeaderboardEntry, index: number): WireEntry {
  const playerId = entry.playerId ?? entry.player_id ?? entry.username ?? "";
  const rankValue = entry.rank ?? index + 1;
  const rank = typeof rankValue === "string" ? Number.parseInt(rankValue, 10) : rankValue;
  return {
    rank: Number.isFinite(rank) ? rank : index + 1,
    playerId,
    score: entry.score ?? 0,
  };
}

export async function fetchLeaderboard(
  baseUrl: string,
  metric: LeaderboardMetric,
): Promise<{ entries: WireEntry[]; totalCount: number }> {
  const res = await fetch(`${baseUrl}/parley.leaderboard.v1.LeaderboardService/GetLeaderboard`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      game: GAME_R6,
      guildId: "",
      type: metricToProtoType(metric),
      limit: LEADERBOARD_LIMIT,
      offset: 0,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`engine leaderboard fetch failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as EngineLeaderboardResponse;
  const entries = (json.entries ?? [])
    .slice(0, LEADERBOARD_LIMIT)
    .map((entry, index) => toWireEntry(entry, index));
  const totalRaw = json.totalCount ?? json.total_count ?? entries.length;
  const totalCount =
    typeof totalRaw === "string" ? Number.parseInt(totalRaw, 10) : Number(totalRaw);

  return {
    entries,
    totalCount: Number.isFinite(totalCount) ? totalCount : entries.length,
  };
}
