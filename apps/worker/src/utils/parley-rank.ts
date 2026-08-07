import {
  RankBronzeEmoji,
  RankChallengerEmoji,
  RankDiamondEmoji,
  RankGoldEmoji,
  RankGrandmasterEmoji,
  RankIronEmoji,
  RankMasterEmoji,
  RankPlatinumEmoji,
  RankSilverEmoji,
  RankUnspecifiedEmoji,
} from "#/utils/constants";

const PARLEY_RANK_EMOJIS = {
  rank_unspecified: RankUnspecifiedEmoji,
  rank_iron: RankIronEmoji,
  rank_bronze: RankBronzeEmoji,
  rank_silver: RankSilverEmoji,
  rank_gold: RankGoldEmoji,
  rank_platinum: RankPlatinumEmoji,
  rank_diamond: RankDiamondEmoji,
  rank_master: RankMasterEmoji,
  rank_grandmaster: RankGrandmasterEmoji,
  rank_challenger: RankChallengerEmoji,
} as const;

type ParleyRankEmojiName = keyof typeof PARLEY_RANK_EMOJIS;

export type ParleyRankTier = {
  id: string;
  label: string;
  minElo: number;
  emojiName: ParleyRankEmojiName;
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

export function formatParleyRankLine(elo: number): string {
  const tier = parleyRankForElo(elo);
  const points = Math.round(elo).toLocaleString("en-US");
  return `${PARLEY_RANK_EMOJIS[tier.emojiName]} **${tier.label}** · ${points}`;
}

export function parseCooldownUntilMs(message: string): number | null {
  const match = message.match(/until (\d+) ms since epoch/);
  if (!match) {
    return null;
  }
  const until = Number(match[1]);
  return Number.isFinite(until) ? until : null;
}
