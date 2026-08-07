import { formatElo, parleyRankForElo } from "@parley/parley-rank";
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

export {
  formatElo,
  formatKd,
  formatWinRate,
  parleyRankForElo,
  PARLEY_RANK_TIERS,
  type ParleyRankTier,
} from "@parley/parley-rank";

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

export function formatParleyRankLine(elo: number): string {
  const tier = parleyRankForElo(elo);
  return `${PARLEY_RANK_EMOJIS[tier.emojiName]} **${tier.label}** · ${formatElo(elo)}`;
}

export function parseCooldownUntilMs(message: string): number | null {
  const match = message.match(/until (\d+) ms since epoch/);
  if (!match) {
    return null;
  }
  const until = Number(match[1]);
  return Number.isFinite(until) ? until : null;
}
