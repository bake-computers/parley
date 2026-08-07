import {
  formatApplicationEmoji,
  type ApplicationEmojiCatalog,
  type AppEmojiName,
} from "@parley/runtime";

export type ParleyRankTier = {
  id: string;
  label: string;
  minElo: number;
  emojiName: AppEmojiName;
};

export const PARLEY_RANK_TIERS: readonly ParleyRankTier[] = [
  { id: "unspecified", label: "Unspecified", minElo: 0, emojiName: "rank_unspecified" },
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

export function formatParleyRankLine(catalog: ApplicationEmojiCatalog, elo: number): string {
  const tier = parleyRankForElo(elo);
  const emoji = formatApplicationEmoji(catalog, tier.emojiName);
  const points = Math.round(elo).toLocaleString("en-US");
  const prefix = emoji ? `${emoji} ` : "";
  return `${prefix}**${tier.label}** · ${points}`;
}

export function parseCooldownUntilMs(message: string): number | null {
  const match = message.match(/until (\d+) ms since epoch/);
  if (!match) {
    return null;
  }
  const until = Number(match[1]);
  return Number.isFinite(until) ? until : null;
}
