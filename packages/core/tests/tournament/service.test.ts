import { describe, expect, test } from "bun:test";
import type { TournamentEntryWithPlayers, TournamentRecord } from "@parley/db/tournaments";
import type { TeamCandidate } from "../../src/team/balance";
import {
  buildTournamentEntrySnapshot,
  normalizeTournamentText,
  validateTournamentJoin,
} from "../../src/tournament/service";

function buildPlayer(playerId: number, discordUserId = `user-${playerId}`): TeamCandidate {
  return {
    discordUserId,
    playerId,
    username: `Player ${playerId}`,
    platform: "pc",
    baseBalanceRating: 1000 + playerId,
    effectiveBalanceRating: 1000 + playerId,
    metrics: {
      rankPoints: 3000,
      kdRatio: 1,
      kost: 60,
      kpr: 0.6,
      headshotPercentage: 40,
      seedScore: 100 + playerId,
    },
  };
}

function buildTournament(overrides: Partial<TournamentRecord> = {}): TournamentRecord {
  return {
    id: 1,
    name: "Summer Cup",
    nameNormalized: "summer cup",
    format: "single",
    teamCap: 8,
    visibility: "public",
    status: "open",
    createdByGuildId: "guild-1",
    createdByChannelId: "channel-1",
    createdByDiscordUserId: "captain-1",
    hubMessageId: null,
    filledAt: null,
    autoStartAt: null,
    startedAt: null,
    completedAt: null,
    winnerEntryId: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function buildEntry(
  id: number,
  overrides: Partial<TournamentEntryWithPlayers> = {},
): TournamentEntryWithPlayers {
  return {
    id,
    tournamentId: 1,
    guildId: "guild-1",
    channelId: "channel-1",
    captainDiscordUserId: `captain-${id}`,
    teamName: `Team ${id}`,
    teamNameNormalized: `team ${id}`,
    status: "joined",
    seedNumber: null,
    stackBalanceTotal: 5000,
    stackBalanceAverage: 1000,
    joinedAt: id,
    eliminatedAt: null,
    createdAt: id,
    updatedAt: id,
    players: Array.from({ length: 5 }, (_, index) => ({
      id: id * 10 + index,
      tournamentId: 1,
      entryId: id,
      discordUserId: `user-${id}-${index}`,
      playerId: id * 10 + index,
      slot: index,
      username: `Player ${id}-${index}`,
      platform: "pc",
      balanceRating: 1000 + index,
      seedRankPoints: 3000,
      seedKdRatio: 1,
      seedKost: 60,
      seedKpr: 0.6,
      seedHeadshotPercentage: 40,
      seedScore: 100,
      createdAt: id,
      updatedAt: id,
    })),
    ...overrides,
  };
}

describe("tournament service", () => {
  test("normalizeTournamentText trims and collapses whitespace", () => {
    expect(normalizeTournamentText("  Summer   Cup  ")).toBe("summer cup");
  });

  test("buildTournamentEntrySnapshot returns stack totals", () => {
    const snapshot = buildTournamentEntrySnapshot([
      buildPlayer(1),
      buildPlayer(2),
      buildPlayer(3),
      buildPlayer(4),
      buildPlayer(5),
    ]);

    expect(snapshot).toEqual({
      playerCount: 5,
      stackBalanceTotal: 5015,
      stackBalanceAverage: 1003,
    });
  });

  test("validateTournamentJoin rejects duplicate team names", () => {
    const result = validateTournamentJoin({
      tournament: buildTournament(),
      existingEntries: [buildEntry(1, { teamName: "Alpha", teamNameNormalized: "alpha" })],
      teamName: "Alpha",
      captainDiscordUserId: "user-1",
      players: [buildPlayer(1), buildPlayer(2), buildPlayer(3), buildPlayer(4), buildPlayer(5)],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("already taken");
  });

  test("validateTournamentJoin rejects overlapping players across entries", () => {
    const overlappingEntry = buildEntry(1, {
      players: [
        {
          id: 1,
          tournamentId: 1,
          entryId: 1,
          discordUserId: "user-1",
          playerId: 1,
          slot: 0,
          username: "Player 1",
          platform: "pc",
          balanceRating: 1000,
          seedRankPoints: 3000,
          seedKdRatio: 1,
          seedKost: 60,
          seedKpr: 0.6,
          seedHeadshotPercentage: 40,
          seedScore: 100,
          createdAt: 1,
          updatedAt: 1,
        },
        ...buildEntry(1).players.slice(1),
      ],
    });

    const result = validateTournamentJoin({
      tournament: buildTournament(),
      existingEntries: [overlappingEntry],
      teamName: "Bravo",
      captainDiscordUserId: "user-1",
      players: [buildPlayer(1), buildPlayer(2), buildPlayer(3), buildPlayer(4), buildPlayer(5)],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("already registered");
  });

  test("validateTournamentJoin allows another team from the same guild with distinct players", () => {
    const result = validateTournamentJoin({
      tournament: buildTournament(),
      existingEntries: [buildEntry(1)],
      teamName: "Bravo",
      captainDiscordUserId: "user-101",
      players: [
        buildPlayer(101),
        buildPlayer(102),
        buildPlayer(103),
        buildPlayer(104),
        buildPlayer(105),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.message).toBeNull();
  });
});
