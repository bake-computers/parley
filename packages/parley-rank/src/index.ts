/** Shared Parley Rank tiers (Glicko display score thresholds). */

export type ParleyRankTier = {
  id: string;
  label: string;
  minElo: number;
  emojiName:
    | "rank_unspecified"
    | "rank_iron"
    | "rank_bronze"
    | "rank_silver"
    | "rank_gold"
    | "rank_platinum"
    | "rank_diamond"
    | "rank_master"
    | "rank_grandmaster"
    | "rank_challenger";
};

export const PARLEY_RANK_TIERS: readonly ParleyRankTier[] = [
  { id: "unspecified", label: "Unranked", minElo: 0, emojiName: "rank_unspecified" },
  { id: "iron", label: "Iron", minElo: 1100, emojiName: "rank_iron" },
  { id: "bronze", label: "Bronze", minElo: 1400, emojiName: "rank_bronze" },
  { id: "silver", label: "Silver", minElo: 1900, emojiName: "rank_silver" },
  { id: "gold", label: "Gold", minElo: 2400, emojiName: "rank_gold" },
  { id: "platinum", label: "Platinum", minElo: 2900, emojiName: "rank_platinum" },
  { id: "diamond", label: "Diamond", minElo: 3400, emojiName: "rank_diamond" },
  { id: "master", label: "Master", minElo: 3900, emojiName: "rank_master" },
  { id: "grandmaster", label: "Grandmaster", minElo: 4400, emojiName: "rank_grandmaster" },
  { id: "challenger", label: "Challenger", minElo: 4900, emojiName: "rank_challenger" },
] as const;

export function parleyRankForElo(elo: number): ParleyRankTier {
  let tier = PARLEY_RANK_TIERS[0]!;
  for (const candidate of PARLEY_RANK_TIERS) {
    if (elo >= candidate.minElo) {
      tier = candidate;
    }
  }
  return tier;
}

export function formatElo(elo: number): string {
  return Math.round(elo).toLocaleString("en-US");
}

export function formatWinRate(wins: number, losses: number): string {
  const total = wins + losses;
  if (total <= 0) {
    return "—";
  }
  return `${((wins / total) * 100).toFixed(1)}%`;
}

export function formatKd(kills: number, deaths: number): string {
  if (deaths <= 0) {
    return kills > 0 ? kills.toFixed(2) : "—";
  }
  return (kills / deaths).toFixed(2);
}
