import { closeDb, connectDb } from "@parley/db/client";
import { deleteGuildRosterCaches } from "@parley/core/guild-roster-cache";
import { getOrBuildGuildRoster } from "@parley/core/guild-roster-service";
import { linkDiscordAccount } from "@parley/db/account-links";
import { createMatchmakingQueue, getMatchmakingQueue } from "@parley/db/matchmaking-queues";
import { createTournament, getTournament } from "@parley/db/tournaments";
import { upsertRegistrationPlayer } from "@parley/core/player-identity";
import { clearGuildLimit, getGuildLimit, upsertGuildLimit } from "@parley/db/guild-limits";

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  return databaseUrl;
}

async function main(): Promise<void> {
  const connection = await connectDb(requireDatabaseUrl());
  const runId = crypto.randomUUID().slice(0, 8);
  const guildId = `smoke-guild-${runId}`;
  const userId = `smoke-user-${runId}`;

  try {
    const playerId = await upsertRegistrationPlayer(connection.db, {
      username: `Smoke${runId}`,
      platform: "pc",
    });

    await linkDiscordAccount(connection.db, {
      guildId,
      discordUserId: userId,
      playerId,
    });

    await upsertGuildLimit(connection.db, {
      guildId,
      dailyMatchLimit: 3,
      updatedByDiscordUserId: userId,
    });

    const limit = await getGuildLimit(connection.db, guildId);
    if (!limit || limit.dailyMatchLimit !== 3) {
      throw new Error("Guild limit smoke test failed.");
    }

    const roster = await getOrBuildGuildRoster(null, connection.db, guildId);
    if (roster.length !== 1) {
      throw new Error("Guild roster smoke test failed.");
    }

    const queueId = await createMatchmakingQueue(connection.db, {
      guildId,
      channelId: `smoke-channel-${runId}`,
      captainDiscordUserId: userId,
      status: "queued",
      playerCount: 1,
      stackBalanceTotal: 1000,
      stackBalanceAverage: 1000,
      expiresAt: Date.now() + 60_000,
      players: [
        {
          discordUserId: userId,
          playerId,
          slot: 0,
          username: `Smoke${runId}`,
          platform: "pc",
          balanceRating: 1000,
          seedRankPoints: 1000,
          seedKdRatio: 1.1,
          seedKost: 0.65,
          seedKpr: 0.8,
          seedHeadshotPercentage: 40,
          seedScore: 1000,
        },
      ],
    });

    const queue = await getMatchmakingQueue(connection.db, queueId);
    if (!queue || queue.players.length !== 1) {
      throw new Error("Matchmaking queue smoke test failed.");
    }

    const tournamentId = await createTournament(connection.db, {
      name: `Smoke ${runId}`,
      nameNormalized: `smoke ${runId}`.toLowerCase(),
      format: "single",
      teamCap: 4,
      status: "open",
      createdByGuildId: guildId,
      createdByChannelId: `smoke-channel-${runId}`,
      createdByDiscordUserId: userId,
    });

    const tournament = await getTournament(connection.db, tournamentId);
    if (!tournament) {
      throw new Error("Tournament smoke test failed.");
    }

    await clearGuildLimit(connection.db, guildId);
    await deleteGuildRosterCaches(null, [guildId]);
    console.log("Postgres smoke test passed.");
  } finally {
    await closeDb(connection);
  }
}

await main();
