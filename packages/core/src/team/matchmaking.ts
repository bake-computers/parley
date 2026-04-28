import type {
  MatchmakingQueuePlayerRecord,
  MatchmakingQueueWithPlayers,
} from "@parley/db/matchmaking-queues";
import type { CachedGuildRosterMember } from "../guild/rosterCache";
import {
  calculateEffectiveBalanceRating,
  type TeamCandidate,
  type TeamSeedMetrics,
} from "./balance";

export const MATCHMAKING_QUEUE_TTL_MS = 30 * 60 * 1000;
export const MATCHMAKING_STACK_SIZE = 5;

const EMPTY_SEED_METRICS: TeamSeedMetrics = {
  rankPoints: 0,
  kdRatio: 0,
  kost: 0,
  kpr: 0,
  headshotPercentage: 0,
  seedScore: 0,
};

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}

function buildTeamCandidate(member: CachedGuildRosterMember): TeamCandidate {
  if (member.balanceRating === null) {
    throw new Error(`Missing balance rating for ${member.username}`);
  }

  return {
    discordUserId: member.discordUserId,
    playerId: member.playerId,
    username: member.username,
    platform: member.platform,
    baseBalanceRating: member.balanceRating,
    effectiveBalanceRating: calculateEffectiveBalanceRating(member.balanceRating, member.platform),
    metrics: member.metrics ?? EMPTY_SEED_METRICS,
  };
}

export interface ReadyRosterSelectionResult {
  selectedDiscordUserIds: string[];
  invalidSelectedDiscordUserIds: string[];
  players: TeamCandidate[];
}

export function validateReadyRosterSelection(
  members: readonly CachedGuildRosterMember[],
  selectedDiscordUserIds: readonly string[],
): ReadyRosterSelectionResult {
  const readyMembers = members.filter((member) => member.ready && member.balanceRating !== null);
  const readyMembersById = new Map(
    readyMembers.map((member) => [member.discordUserId, member] as const),
  );
  const selected: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const discordUserId of selectedDiscordUserIds) {
    if (seen.has(discordUserId)) {
      continue;
    }
    seen.add(discordUserId);

    const member = readyMembersById.get(discordUserId);
    if (!member) {
      invalid.push(discordUserId);
      continue;
    }

    selected.push(discordUserId);
  }

  return {
    selectedDiscordUserIds: selected,
    invalidSelectedDiscordUserIds: invalid,
    players: selected.map((discordUserId) =>
      buildTeamCandidate(readyMembersById.get(discordUserId)!),
    ),
  };
}

export interface MatchmakingQueuePlayerSnapshot {
  discordUserId: string;
  playerId: number;
  slot: number;
  username: string;
  platform: string;
  balanceRating: number;
}

export interface MatchmakingQueueLike {
  id: number;
  guildId: string;
  status: string;
  stackBalanceTotal: number;
  expiresAt: number;
  createdAt: number;
  players: readonly MatchmakingQueuePlayerSnapshot[];
}

export interface MatchmakingQueueSnapshot {
  playerCount: number;
  stackBalanceTotal: number;
  stackBalanceAverage: number;
}

export function buildMatchmakingQueueSnapshot(
  players: readonly Pick<TeamCandidate, "effectiveBalanceRating">[],
): MatchmakingQueueSnapshot {
  const stackBalanceTotal = roundScore(
    players.reduce((total, player) => total + player.effectiveBalanceRating, 0),
  );
  return {
    playerCount: players.length,
    stackBalanceTotal,
    stackBalanceAverage: players.length === 0 ? 0 : roundScore(stackBalanceTotal / players.length),
  };
}

export function isMatchmakingQueueExpired(
  queue: Pick<MatchmakingQueueLike, "expiresAt">,
  nowMs = Date.now(),
): boolean {
  return queue.expiresAt < nowMs;
}

export function hasOverlappingMatchmakingPlayers(
  left: Pick<MatchmakingQueueLike, "players">,
  right: Pick<MatchmakingQueueLike, "players">,
): boolean {
  const leftDiscordUserIds = new Set(left.players.map((player) => player.discordUserId));
  const leftPlayerIds = new Set(left.players.map((player) => player.playerId));

  return right.players.some(
    (player) => leftDiscordUserIds.has(player.discordUserId) || leftPlayerIds.has(player.playerId),
  );
}

export function findReservedMatchmakingPlayerIds(
  players: readonly Pick<TeamCandidate, "discordUserId" | "playerId">[],
  queues: readonly MatchmakingQueueLike[],
  nowMs = Date.now(),
): string[] {
  const selectedDiscordUserIds = new Set(players.map((player) => player.discordUserId));
  const selectedPlayerIds = new Set(players.map((player) => player.playerId));
  const conflicts = new Set<string>();

  for (const queue of queues) {
    if (queue.status !== "queued" || isMatchmakingQueueExpired(queue, nowMs)) {
      continue;
    }

    for (const player of queue.players) {
      if (
        selectedDiscordUserIds.has(player.discordUserId) ||
        selectedPlayerIds.has(player.playerId)
      ) {
        conflicts.add(player.discordUserId);
      }
    }
  }

  return [...conflicts].sort((left, right) => left.localeCompare(right));
}

export function chooseBestMatchmakingOpponent(
  queue: MatchmakingQueueLike,
  opponents: readonly MatchmakingQueueLike[],
  nowMs = Date.now(),
): MatchmakingQueueWithPlayers | MatchmakingQueueLike | null {
  const eligible = opponents
    .filter((opponent) => opponent.status === "queued")
    .filter((opponent) => !isMatchmakingQueueExpired(opponent, nowMs))
    .filter((opponent) => opponent.id !== queue.id)
    .filter((opponent) => opponent.guildId !== queue.guildId)
    .filter((opponent) => !hasOverlappingMatchmakingPlayers(queue, opponent))
    .sort((left, right) => {
      const leftGap = Math.abs(left.stackBalanceTotal - queue.stackBalanceTotal);
      const rightGap = Math.abs(right.stackBalanceTotal - queue.stackBalanceTotal);
      if (leftGap !== rightGap) {
        return leftGap - rightGap;
      }
      if (left.createdAt !== right.createdAt) {
        return left.createdAt - right.createdAt;
      }
      return left.id - right.id;
    });

  return eligible[0] ?? null;
}

export function toMatchmakingQueuePlayers(
  players: readonly TeamCandidate[],
): Array<
  Pick<
    MatchmakingQueuePlayerRecord,
    | "discordUserId"
    | "playerId"
    | "slot"
    | "username"
    | "platform"
    | "balanceRating"
    | "seedRankPoints"
    | "seedKdRatio"
    | "seedKost"
    | "seedKpr"
    | "seedHeadshotPercentage"
    | "seedScore"
  >
> {
  return players.map((player, index) => ({
    discordUserId: player.discordUserId,
    playerId: player.playerId,
    slot: index,
    username: player.username,
    platform: player.platform,
    balanceRating: player.effectiveBalanceRating,
    seedRankPoints: player.metrics.rankPoints,
    seedKdRatio: player.metrics.kdRatio,
    seedKost: player.metrics.kost,
    seedKpr: player.metrics.kpr,
    seedHeadshotPercentage: player.metrics.headshotPercentage,
    seedScore: player.metrics.seedScore,
  }));
}
