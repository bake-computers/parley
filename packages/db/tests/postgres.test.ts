import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { linkDiscordAccount } from "../src/account-links";
import { closeDb, connectDb, type DbConnection } from "../src/client";
import { listGuildRoster } from "../src/guild-roster";
import { countGlobalLeaderboard, listGlobalLeaderboardPage } from "../src/leaderboard";
import {
  createMatchmakingQueue,
  expireStaleMatchmakingQueues,
  getMatchmakingQueue,
} from "../src/matchmaking-queues";
import {
  createTournament,
  createTournamentEntry,
  getTournamentWithEntries,
} from "../src/tournaments";
import { upsertRegistrationPlayer } from "../../core/src/player/identity";
import { persistStatsSnapshot } from "../../core/src/stats/snapshot";
import { createCustomMatch, completeCustomMatch, getCustomMatch } from "../../core/src/lib/matches";
import {
  customMatchPlayers,
  customMatches,
  discordAccounts,
  guildLimits,
  guildPlayers,
  matchmakingQueuePlayers,
  matchmakingQueues,
  players,
  statSnapshots,
  tournamentBracketMatches,
  tournamentEntries,
  tournamentEntryPlayers,
  tournaments,
} from "../src/schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgresEnabled = typeof databaseUrl === "string" && databaseUrl.length > 0;

const serialTables = [
  "players",
  "stat_snapshots",
  "discord_accounts",
  "guild_players",
  "guild_limits",
  "custom_matches",
  "custom_match_players",
  "matchmaking_queues",
  "matchmaking_queue_players",
  "tournaments",
  "tournament_entries",
  "tournament_entry_players",
  "tournament_bracket_matches",
];

const truncateOrder = [
  matchmakingQueuePlayers,
  matchmakingQueues,
  tournamentBracketMatches,
  tournamentEntryPlayers,
  tournamentEntries,
  tournaments,
  customMatchPlayers,
  customMatches,
  guildLimits,
  guildPlayers,
  discordAccounts,
  statSnapshots,
  players,
];

let connection: DbConnection | null = null;

async function resetDatabase(): Promise<void> {
  if (!connection) {
    return;
  }

  for (const table of truncateOrder) {
    await connection.db.delete(table);
  }

  for (const tableName of serialTables) {
    await connection.db.execute(sql.raw(`alter sequence ${tableName}_id_seq restart with 1;`));
  }
}

async function createPlayer(username: string): Promise<number> {
  if (!connection) {
    throw new Error("Missing test database connection.");
  }

  return upsertRegistrationPlayer(connection.db, {
    username,
    platform: "pc",
  });
}

describe.if(postgresEnabled)("postgres database integration", () => {
  beforeAll(async () => {
    connection = await connectDb(databaseUrl!);
  });

  afterAll(async () => {
    await closeDb(connection);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  test("account linking upserts and enforces ownership", async () => {
    const playerId = await createPlayer("LinkPlayer");

    const linked = await linkDiscordAccount(connection!.db, {
      guildId: "guild-1",
      discordUserId: "user-1",
      playerId,
    });

    expect(linked.previousPlayerId).toBeNull();

    await expect(
      linkDiscordAccount(connection!.db, {
        guildId: "guild-1",
        discordUserId: "user-2",
        playerId,
      }),
    ).rejects.toThrow("already linked");
  });

  test("guild roster returns the latest snapshot", async () => {
    const playerId = await createPlayer("RosterPlayer");
    await linkDiscordAccount(connection!.db, {
      guildId: "guild-1",
      discordUserId: "user-1",
      playerId,
    });

    await persistStatsSnapshot(connection!.db, {
      profile: {
        username: "RosterPlayer",
        profile_id: "profile-1",
        platform: "pc",
        level: 10,
      },
      rankedStats: {
        current_rank: "Gold",
        current_rank_tier: "III",
        rank_points: 2000,
        matches: 10,
        wins: 6,
        losses: 4,
        kills: 40,
        deaths: 30,
        assists: 10,
        headshots: 15,
        kd_ratio: 1.33,
        headshot_percentage: 37,
        win_rate: 60,
      },
      calculatedMetrics: {
        kost: 0.64,
      },
      cacheVersion: 2,
      fetchedAt: 1000,
      source: "live",
    });

    await persistStatsSnapshot(connection!.db, {
      profile: {
        username: "RosterPlayer",
        profile_id: "profile-1",
        platform: "pc",
        level: 10,
      },
      rankedStats: {
        current_rank: "Platinum",
        current_rank_tier: "V",
        rank_points: 2500,
        matches: 12,
        wins: 7,
        losses: 5,
        kills: 50,
        deaths: 35,
        assists: 12,
        headshots: 20,
        kd_ratio: 1.43,
        headshot_percentage: 40,
        win_rate: 58,
      },
      calculatedMetrics: {
        kost: 0.7,
      },
      cacheVersion: 2,
      fetchedAt: 2000,
      source: "refresh",
    });

    const roster = await listGuildRoster(connection!.db, "guild-1");
    expect(roster).toHaveLength(1);
    expect(roster[0]?.snapshot?.fetchedAt).toBe(2000);
  });

  test("matchmaking queue can be created and expired", async () => {
    const playerId = await createPlayer("QueuePlayer");

    const queueId = await createMatchmakingQueue(connection!.db, {
      guildId: "guild-1",
      channelId: "channel-1",
      captainDiscordUserId: "user-1",
      status: "queued",
      playerCount: 1,
      stackBalanceTotal: 1000,
      stackBalanceAverage: 1000,
      expiresAt: 1,
      players: [
        {
          discordUserId: "user-1",
          playerId,
          slot: 0,
          username: "QueuePlayer",
          platform: "pc",
          balanceRating: 1000,
          seedRankPoints: 1200,
          seedKdRatio: 1.1,
          seedKost: 0.65,
          seedKpr: 0.8,
          seedHeadshotPercentage: 40,
          seedScore: 1100,
        },
      ],
    });

    await expireStaleMatchmakingQueues(connection!.db, Date.now());
    const queue = await getMatchmakingQueue(connection!.db, queueId);

    expect(queue?.status).toBe("expired");
    expect(queue?.players).toHaveLength(1);
  });

  test("custom matches can be completed", async () => {
    const playerA = await createPlayer("MatchA");
    const playerB = await createPlayer("MatchB");

    const matchId = await createCustomMatch(connection!.db, {
      guildId: "guild-1",
      channelId: "channel-1",
      messageId: "message-1",
      createdByDiscordUserId: "captain-1",
      status: "pending_results",
      teamASeedTotal: 1000,
      teamBSeedTotal: 900,
      seedGap: 100,
      teamABalanceTotal: 1000,
      teamBBalanceTotal: 900,
      balanceGap: 100,
      players: [
        {
          discordUserId: "user-a",
          playerId: playerA,
          team: "A",
          slot: 0,
          seedRankPoints: 1200,
          seedKdRatio: 1.2,
          seedKost: 0.65,
          seedKpr: 0.8,
          seedHeadshotPercentage: 45,
          seedScore: 1100,
          balanceRating: 1000,
        },
        {
          discordUserId: "user-b",
          playerId: playerB,
          team: "B",
          slot: 0,
          seedRankPoints: 1100,
          seedKdRatio: 1.1,
          seedKost: 0.62,
          seedKpr: 0.75,
          seedHeadshotPercentage: 40,
          seedScore: 1000,
          balanceRating: 900,
        },
      ],
    });

    await completeCustomMatch(connection!.db, {
      matchId,
      winningTeam: "A",
      resultsByDiscordUserId: new Map([
        ["user-a", { kills: 8, deaths: 4 }],
        ["user-b", { kills: 5, deaths: 8 }],
      ]),
    });

    const match = await getCustomMatch(connection!.db, matchId);
    expect(match?.status).toBe("completed");
    expect(match?.winningTeam).toBe("A");
  });

  test("tournament persistence includes entries", async () => {
    const playerId = await createPlayer("TournamentPlayer");

    const tournamentId = await createTournament(connection!.db, {
      name: "Integration Cup",
      nameNormalized: "integration cup",
      format: "single",
      teamCap: 4,
      status: "open",
      createdByGuildId: "guild-1",
      createdByChannelId: "channel-1",
      createdByDiscordUserId: "captain-1",
    });

    await createTournamentEntry(connection!.db, {
      tournamentId,
      guildId: "guild-1",
      channelId: "channel-1",
      captainDiscordUserId: "captain-1",
      teamName: "Alpha",
      teamNameNormalized: "alpha",
      status: "joined",
      stackBalanceTotal: 1000,
      stackBalanceAverage: 1000,
      players: [
        {
          discordUserId: "captain-1",
          playerId,
          slot: 0,
          username: "TournamentPlayer",
          platform: "pc",
          balanceRating: 1000,
          seedRankPoints: 1200,
          seedKdRatio: 1.2,
          seedKost: 0.65,
          seedKpr: 0.8,
          seedHeadshotPercentage: 45,
          seedScore: 1100,
        },
      ],
    });

    const tournament = await getTournamentWithEntries(connection!.db, tournamentId);
    expect(tournament?.entries).toHaveLength(1);
    expect(tournament?.entries[0]?.players).toHaveLength(1);
  });

  test("global leaderboard count respects platform and min matches filters", async () => {
    const playerPcA = await createPlayer("LeaderPcA");
    const playerXbox = await createPlayer("LeaderXbox");
    const playerPcB = await createPlayer("LeaderPcB");
    const playerPs = await createPlayer("LeaderPs");

    await connection!.db
      .update(players)
      .set({
        internalMatches: 5,
        internalWins: 3,
        internalLosses: 2,
        internalElo: 1200,
      })
      .where(eq(players.id, playerPcA));
    await connection!.db
      .update(players)
      .set({
        platform: "xbox",
        internalMatches: 3,
        internalWins: 2,
        internalLosses: 1,
        internalElo: 1150,
      })
      .where(eq(players.id, playerXbox));
    await connection!.db
      .update(players)
      .set({
        internalMatches: 9,
        internalWins: 6,
        internalLosses: 3,
        internalElo: 1300,
      })
      .where(eq(players.id, playerPcB));
    await connection!.db
      .update(players)
      .set({
        platform: "playstation",
        internalMatches: 0,
        internalWins: 0,
        internalLosses: 0,
        internalElo: 1400,
      })
      .where(eq(players.id, playerPs));

    await expect(
      countGlobalLeaderboard(connection!.db, {
        platform: "all",
        minMatches: 1,
      }),
    ).resolves.toBe(3);
    await expect(
      countGlobalLeaderboard(connection!.db, {
        platform: "pc",
        minMatches: 4,
      }),
    ).resolves.toBe(2);
    await expect(
      countGlobalLeaderboard(connection!.db, {
        platform: "xbox",
        minMatches: 4,
      }),
    ).resolves.toBe(0);
  });

  test("global leaderboard pagination is stable and ordered", async () => {
    const alphaId = await createPlayer("Alpha");
    const betaId = await createPlayer("Beta");
    const charlieId = await createPlayer("Charlie");
    const deltaId = await createPlayer("Delta");
    const echoId = await createPlayer("Echo");

    await connection!.db
      .update(players)
      .set({ internalElo: 1300, internalMatches: 5, internalWins: 3, internalLosses: 2 })
      .where(eq(players.id, alphaId));
    await connection!.db
      .update(players)
      .set({ internalElo: 1300, internalMatches: 5, internalWins: 4, internalLosses: 1 })
      .where(eq(players.id, betaId));
    await connection!.db
      .update(players)
      .set({ internalElo: 1300, internalMatches: 4, internalWins: 2, internalLosses: 2 })
      .where(eq(players.id, charlieId));
    await connection!.db
      .update(players)
      .set({ internalElo: 1200, internalMatches: 10, internalWins: 6, internalLosses: 4 })
      .where(eq(players.id, deltaId));
    await connection!.db
      .update(players)
      .set({ internalElo: 1100, internalMatches: 30, internalWins: 20, internalLosses: 10 })
      .where(eq(players.id, echoId));

    await linkDiscordAccount(connection!.db, {
      guildId: "guild-1",
      discordUserId: "user-beta",
      playerId: betaId,
    });

    const pageOne = await listGlobalLeaderboardPage(connection!.db, {
      platform: "all",
      minMatches: 1,
      limit: 2,
      offset: 0,
    });
    const pageTwo = await listGlobalLeaderboardPage(connection!.db, {
      platform: "all",
      minMatches: 1,
      limit: 2,
      offset: 2,
    });

    expect(pageOne.map((entry) => entry.username)).toEqual(["Alpha", "Beta"]);
    expect(pageOne[1]?.discordUserId).toBe("user-beta");
    expect(pageTwo.map((entry) => entry.username)).toEqual(["Charlie", "Delta"]);
  });
});

describe("postgres database integration", () => {
  test("skips when TEST_DATABASE_URL is missing", async () => {
    if (postgresEnabled) {
      return;
    }

    expect(databaseUrl).toBeUndefined();
  });
});
