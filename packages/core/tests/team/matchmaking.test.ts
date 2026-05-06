import { describe, expect, test } from "bun:test";
import type { CachedGuildRosterMember } from "../../src/guild/rosterCache";
import {
  MATCHMAKING_QUEUE_TTL_MS,
  buildMatchmakingQueueSnapshot,
  chooseBestMatchmakingOpponent,
  findReservedMatchmakingPlayerIds,
  validateReadyRosterSelection,
} from "../../src/team/matchmaking";

const DEFAULT_METRICS = {
  rankPoints: 3000,
  kdRatio: 1,
  kost: 60,
  kpr: 0.6,
  headshotPercentage: 40,
  seedScore: 100,
} as const;

function buildMember(playerId: number, overrides: Partial<CachedGuildRosterMember> = {}) {
  const ready = overrides.ready ?? overrides.balanceRating !== null;

  return {
    guildId: "guild-1",
    discordUserId: `user-${playerId}`,
    playerId,
    username: `Player ${playerId}`,
    platform: "pc",
    profileUrl: null,
    level: 1,
    internalElo: 1000 + playerId,
    internalMatches: 0,
    internalWins: 0,
    internalLosses: 0,
    internalUpdatedAt: null,
    guildInternalElo: 1000 + playerId,
    guildInternalMatches: 0,
    guildInternalWins: 0,
    guildInternalLosses: 0,
    guildInternalUpdatedAt: null,
    balanceRating: 1000 + playerId,
    registeredAt: 1,
    updatedAt: 1,
    ready,
    snapshotFetchedAt: 1,
    metrics: DEFAULT_METRICS,
    ...overrides,
  } satisfies CachedGuildRosterMember;
}

function buildQueue(input: {
  id: number;
  guildId: string;
  createdAt: number;
  stackBalanceTotal: number;
  playerIds: number[];
  expiresAt?: number;
  status?: string;
}) {
  return {
    id: input.id,
    guildId: input.guildId,
    status: input.status ?? "queued",
    stackBalanceTotal: input.stackBalanceTotal,
    expiresAt: input.expiresAt ?? Date.now() + MATCHMAKING_QUEUE_TTL_MS,
    createdAt: input.createdAt,
    players: input.playerIds.map((playerId, index) => ({
      discordUserId: `user-${playerId}`,
      playerId,
      slot: index,
      username: `Player ${playerId}`,
      platform: "pc",
      balanceRating: 1000 + playerId,
    })),
  };
}

describe("team matchmaking", () => {
  test("validateReadyRosterSelection ignores invalid picks and dedupes selected users", () => {
    const members = [
      buildMember(1),
      buildMember(2),
      buildMember(3, { ready: false, balanceRating: null }),
    ];

    const result = validateReadyRosterSelection(members, [
      "user-1",
      "user-1",
      "user-3",
      "user-404",
      "user-2",
    ]);

    expect(result.selectedDiscordUserIds).toEqual(["user-1", "user-2"]);
    expect(result.invalidSelectedDiscordUserIds).toEqual(["user-3", "user-404"]);
    expect(result.players.map((player) => player.discordUserId)).toEqual(["user-1", "user-2"]);
  });

  test("buildMatchmakingQueueSnapshot returns exact totals and average", () => {
    const result = buildMatchmakingQueueSnapshot([
      { effectiveBalanceRating: 1000 },
      { effectiveBalanceRating: 1010 },
      { effectiveBalanceRating: 1020 },
      { effectiveBalanceRating: 1030 },
      { effectiveBalanceRating: 1040 },
    ]);

    expect(result).toEqual({
      playerCount: 5,
      stackBalanceTotal: 5100,
      stackBalanceAverage: 1020,
    });
  });

  test("findReservedMatchmakingPlayerIds returns conflicting queued users only", () => {
    const players = validateReadyRosterSelection(
      [buildMember(1), buildMember(2), buildMember(3), buildMember(4), buildMember(5)],
      ["user-1", "user-2", "user-3", "user-4", "user-5"],
    ).players;

    const conflicts = findReservedMatchmakingPlayerIds(players, [
      buildQueue({
        id: 1,
        guildId: "guild-2",
        createdAt: 1,
        stackBalanceTotal: 5000,
        playerIds: [4, 6, 7, 8, 9],
      }),
      buildQueue({
        id: 2,
        guildId: "guild-3",
        createdAt: 2,
        stackBalanceTotal: 5050,
        playerIds: [10, 11, 12, 13, 14],
        status: "matched",
      }),
    ]);

    expect(conflicts).toEqual(["user-4"]);
  });

  test("chooseBestMatchmakingOpponent ignores same guild, overlaps, and expired queues", () => {
    const now = Date.now();
    const queue = buildQueue({
      id: 10,
      guildId: "guild-1",
      createdAt: 10,
      stackBalanceTotal: 5000,
      playerIds: [1, 2, 3, 4, 5],
      expiresAt: now + MATCHMAKING_QUEUE_TTL_MS,
    });

    const result = chooseBestMatchmakingOpponent(
      queue,
      [
        buildQueue({
          id: 11,
          guildId: "guild-1",
          createdAt: 1,
          stackBalanceTotal: 5001,
          playerIds: [6, 7, 8, 9, 10],
        }),
        buildQueue({
          id: 12,
          guildId: "guild-2",
          createdAt: 2,
          stackBalanceTotal: 4999,
          playerIds: [1, 6, 7, 8, 9],
        }),
        buildQueue({
          id: 13,
          guildId: "guild-3",
          createdAt: 3,
          stackBalanceTotal: 5002,
          playerIds: [11, 12, 13, 14, 15],
          expiresAt: now - 1,
        }),
        buildQueue({
          id: 14,
          guildId: "guild-4",
          createdAt: 4,
          stackBalanceTotal: 5005,
          playerIds: [16, 17, 18, 19, 20],
          expiresAt: now + MATCHMAKING_QUEUE_TTL_MS,
        }),
      ],
      now,
    );

    expect(result?.id).toBe(14);
  });

  test("chooseBestMatchmakingOpponent breaks ties by oldest queue", () => {
    const now = Date.now();
    const queue = buildQueue({
      id: 20,
      guildId: "guild-1",
      createdAt: 10,
      stackBalanceTotal: 5000,
      playerIds: [1, 2, 3, 4, 5],
      expiresAt: now + MATCHMAKING_QUEUE_TTL_MS,
    });

    const result = chooseBestMatchmakingOpponent(
      queue,
      [
        buildQueue({
          id: 21,
          guildId: "guild-2",
          createdAt: 100,
          stackBalanceTotal: 5020,
          playerIds: [6, 7, 8, 9, 10],
        }),
        buildQueue({
          id: 22,
          guildId: "guild-3",
          createdAt: 50,
          stackBalanceTotal: 5020,
          playerIds: [11, 12, 13, 14, 15],
        }),
      ],
      now,
    );

    expect(result?.id).toBe(22);
  });
});
