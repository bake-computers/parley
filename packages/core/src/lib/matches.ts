import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import type { DbClient } from "@parley/db/client";
import { customMatchPlayers, customMatches, guildPlayers, players } from "@parley/db/schema";
import { calculateTeamEloDelta, roundInternalElo, type MatchWinner } from "./elo";

export type CustomMatchStatus = "cancelled" | "completed" | "pending_results";
export type CustomMatchType = "cross_guild" | "internal" | "tournament";
export type CustomMatchTeam = "A" | "B";
export type CustomMatchResolutionType = "forfeit" | "played";

export interface CustomMatchPlayerRecord {
  id: number;
  matchId: number;
  discordUserId: string;
  playerId: number;
  team: string;
  slot: number;
  seedRankPoints: number;
  seedKdRatio: number;
  seedKost: number;
  seedKpr: number;
  seedHeadshotPercentage: number;
  seedScore: number;
  balanceRating: number;
  kills: number | null;
  deaths: number | null;
  createdAt: number;
  updatedAt: number;
  username?: string;
  platform?: string;
}

export interface CustomMatchRecord {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string;
  createdByDiscordUserId: string;
  status: string;
  matchType: string;
  opponentGuildId: string | null;
  opponentChannelId: string | null;
  opponentMessageId: string | null;
  opponentCaptainDiscordUserId: string | null;
  teamASeedTotal: number;
  teamBSeedTotal: number;
  seedGap: number;
  winningTeam: string | null;
  resolutionType: string;
  teamABalanceTotal: number;
  teamBBalanceTotal: number;
  balanceGap: number;
  createdAt: number;
  updatedAt: number;
}

export interface AntiCheatValidationError {
  reason: string;
}

export function validateMatchResults(
  players: readonly CustomMatchPlayerRecord[],
  resultsByDiscordUserId: ReadonlyMap<string, { kills: number; deaths: number }>,
): AntiCheatValidationError | null {
  const teamA = players.filter((p) => p.team === "A");
  const teamB = players.filter((p) => p.team === "B");

  const teamAKills = teamA.reduce(
    (sum, p) => sum + (resultsByDiscordUserId.get(p.discordUserId)?.kills ?? 0),
    0,
  );
  const teamADeaths = teamA.reduce(
    (sum, p) => sum + (resultsByDiscordUserId.get(p.discordUserId)?.deaths ?? 0),
    0,
  );
  const teamBKills = teamB.reduce(
    (sum, p) => sum + (resultsByDiscordUserId.get(p.discordUserId)?.kills ?? 0),
    0,
  );
  const teamBDeaths = teamB.reduce(
    (sum, p) => sum + (resultsByDiscordUserId.get(p.discordUserId)?.deaths ?? 0),
    0,
  );

  if (teamAKills === 0 && teamADeaths === 0 && teamBKills === 0 && teamBDeaths === 0) {
    return { reason: "All players have 0 kills and 0 deaths — match stats look fabricated." };
  }

  const killDeathTolerance = 2;
  if (Math.abs(teamAKills - teamBDeaths) > killDeathTolerance) {
    return {
      reason: `Kill-death mismatch: Team A has ${teamAKills} kills but Team B has ${teamBDeaths} deaths.`,
    };
  }
  if (Math.abs(teamBKills - teamADeaths) > killDeathTolerance) {
    return {
      reason: `Kill-death mismatch: Team B has ${teamBKills} kills but Team A has ${teamADeaths} deaths.`,
    };
  }

  for (const player of players) {
    const result = resultsByDiscordUserId.get(player.discordUserId);
    if (!result) {
      continue;
    }
    if (result.kills === 0 && result.deaths === 0) {
      return {
        reason: `Player ${player.username ?? player.discordUserId} has 0 kills and 0 deaths — every player must have some match activity.`,
      };
    }
  }

  return null;
}

function currentTimestamp() {
  return Date.now();
}

export async function createCustomMatch(
  database: DbClient,
  input: {
    guildId: string;
    channelId: string;
    messageId: string;
    createdByDiscordUserId: string;
    status: CustomMatchStatus;
    matchType?: CustomMatchType;
    opponentGuildId?: string | null;
    opponentChannelId?: string | null;
    opponentMessageId?: string | null;
    opponentCaptainDiscordUserId?: string | null;
    teamASeedTotal: number;
    teamBSeedTotal: number;
    seedGap: number;
    teamABalanceTotal: number;
    teamBBalanceTotal: number;
    balanceGap: number;
    resolutionType?: CustomMatchResolutionType;
    players: Array<{
      discordUserId: string;
      playerId: number;
      team: CustomMatchTeam;
      slot: number;
      seedRankPoints: number;
      seedKdRatio: number;
      seedKost: number;
      seedKpr: number;
      seedHeadshotPercentage: number;
      seedScore: number;
      balanceRating: number;
    }>;
  },
): Promise<number> {
  const db = database;
  const now = currentTimestamp();
  const inserted = await db
    .insert(customMatches)
    .values({
      guildId: input.guildId,
      channelId: input.channelId,
      messageId: input.messageId,
      createdByDiscordUserId: input.createdByDiscordUserId,
      status: input.status,
      matchType: input.matchType ?? "internal",
      opponentGuildId: input.opponentGuildId ?? null,
      opponentChannelId: input.opponentChannelId ?? null,
      opponentMessageId: input.opponentMessageId ?? null,
      opponentCaptainDiscordUserId: input.opponentCaptainDiscordUserId ?? null,
      teamASeedTotal: input.teamASeedTotal,
      teamBSeedTotal: input.teamBSeedTotal,
      seedGap: input.seedGap,
      resolutionType: input.resolutionType ?? "played",
      teamABalanceTotal: input.teamABalanceTotal,
      teamBBalanceTotal: input.teamBBalanceTotal,
      balanceGap: input.balanceGap,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: customMatches.id });

  const matchId = inserted[0]?.id;
  if (!matchId) {
    throw new Error("Failed to create custom match");
  }

  await db.insert(customMatchPlayers).values(
    input.players.map((player) => ({
      matchId,
      discordUserId: player.discordUserId,
      playerId: player.playerId,
      team: player.team,
      slot: player.slot,
      seedRankPoints: player.seedRankPoints,
      seedKdRatio: player.seedKdRatio,
      seedKost: player.seedKost,
      seedKpr: player.seedKpr,
      seedHeadshotPercentage: player.seedHeadshotPercentage,
      seedScore: player.seedScore,
      balanceRating: player.balanceRating,
      createdAt: now,
      updatedAt: now,
    })),
  );

  return matchId;
}

export async function updateCustomMatchMessageId(
  database: DbClient,
  input: {
    matchId: number;
    messageId: string;
    opponentMessageId?: string | null;
  },
): Promise<void> {
  const db = database;
  await db
    .update(customMatches)
    .set({
      messageId: input.messageId,
      opponentMessageId: input.opponentMessageId,
      updatedAt: currentTimestamp(),
    })
    .where(eq(customMatches.id, input.matchId));
}

export async function getCustomMatch(
  database: DbClient | null | undefined,
  matchId: number,
): Promise<(CustomMatchRecord & { players: CustomMatchPlayerRecord[] }) | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const matchRows = await db
    .select()
    .from(customMatches)
    .where(eq(customMatches.id, matchId))
    .limit(1);
  const match = matchRows[0];
  if (!match) {
    return null;
  }

  const playersForMatch = await db
    .select({
      id: customMatchPlayers.id,
      matchId: customMatchPlayers.matchId,
      discordUserId: customMatchPlayers.discordUserId,
      playerId: customMatchPlayers.playerId,
      team: customMatchPlayers.team,
      slot: customMatchPlayers.slot,
      seedRankPoints: customMatchPlayers.seedRankPoints,
      seedKdRatio: customMatchPlayers.seedKdRatio,
      seedKost: customMatchPlayers.seedKost,
      seedKpr: customMatchPlayers.seedKpr,
      seedHeadshotPercentage: customMatchPlayers.seedHeadshotPercentage,
      seedScore: customMatchPlayers.seedScore,
      balanceRating: customMatchPlayers.balanceRating,
      kills: customMatchPlayers.kills,
      deaths: customMatchPlayers.deaths,
      createdAt: customMatchPlayers.createdAt,
      updatedAt: customMatchPlayers.updatedAt,
      username: players.username,
      platform: players.platform,
    })
    .from(customMatchPlayers)
    .innerJoin(players, eq(players.id, customMatchPlayers.playerId))
    .where(eq(customMatchPlayers.matchId, matchId));

  playersForMatch.sort((left, right) => {
    if (left.team !== right.team) {
      return left.team.localeCompare(right.team);
    }
    return left.slot - right.slot;
  });

  return {
    ...match,
    players: playersForMatch,
  };
}

export async function completeCustomMatch(
  database: DbClient,
  input: {
    matchId: number;
    resultsByDiscordUserId?: ReadonlyMap<string, { kills: number; deaths: number }>;
    winningTeam: MatchWinner;
    resolutionType?: CustomMatchResolutionType;
  },
): Promise<void> {
  const db = database;
  const now = currentTimestamp();
  const match = await getCustomMatch(database, input.matchId);
  if (!match) {
    throw new Error("Custom match not found");
  }

  const resolutionType = input.resolutionType ?? "played";
  if (resolutionType === "played") {
    if (!input.resultsByDiscordUserId) {
      throw new Error("Missing match results for played match completion");
    }

    for (const player of match.players) {
      const result = input.resultsByDiscordUserId.get(player.discordUserId);
      if (!result) {
        throw new Error("Missing match result for one or more players");
      }

      await db
        .update(customMatchPlayers)
        .set({
          kills: result.kills,
          deaths: result.deaths,
          updatedAt: now,
        })
        .where(eq(customMatchPlayers.id, player.id));
    }
  }

  const teamAPlayers = match.players.filter((player) => player.team === "A");
  const teamBPlayers = match.players.filter((player) => player.team === "B");
  const teamARating =
    teamAPlayers.reduce((total, player) => total + player.balanceRating, 0) / teamAPlayers.length;
  const teamBRating =
    teamBPlayers.reduce((total, player) => total + player.balanceRating, 0) / teamBPlayers.length;
  const teamADelta = calculateTeamEloDelta({
    teamARating,
    teamBRating,
    winner: input.winningTeam,
  });
  const playerIds = match.players.map((player) => player.playerId);
  const currentPlayers = await db
    .select({
      id: players.id,
      internalElo: players.internalElo,
      internalMatches: players.internalMatches,
      internalWins: players.internalWins,
      internalLosses: players.internalLosses,
    })
    .from(players)
    .where(inArray(players.id, playerIds));
  const currentPlayersById = new Map(currentPlayers.map((player) => [player.id, player]));

  // Determine each player's guild for guild-specific ELO tracking
  const isCrossGuild =
    typeof match.opponentGuildId === "string" && match.opponentGuildId.length > 0;
  const playerGuildIds = new Map<number, string>();
  for (const player of match.players) {
    const targetGuildId = isCrossGuild
      ? player.team === "A"
        ? match.guildId
        : match.opponentGuildId!
      : match.guildId;
    playerGuildIds.set(player.playerId, targetGuildId);
  }

  const guildPlayerKeys = match.players
    .map((player) => ({
      guildId: playerGuildIds.get(player.playerId)!,
      playerId: player.playerId,
    }))
    .filter((key) => typeof key.guildId === "string" && key.guildId.length > 0);

  const currentGuildPlayers =
    guildPlayerKeys.length > 0
      ? await db
          .select({
            guildId: guildPlayers.guildId,
            playerId: guildPlayers.playerId,
            internalElo: guildPlayers.internalElo,
            internalMatches: guildPlayers.internalMatches,
            internalWins: guildPlayers.internalWins,
            internalLosses: guildPlayers.internalLosses,
          })
          .from(guildPlayers)
          .where(
            inArray(
              guildPlayers.playerId,
              guildPlayerKeys.map((k) => k.playerId),
            ),
          )
      : [];

  const currentGuildPlayersByKey = new Map(
    currentGuildPlayers.map((gp) => [`${gp.guildId}:${gp.playerId}`, gp]),
  );

  for (const player of match.players) {
    const currentPlayer = currentPlayersById.get(player.playerId);
    if (!currentPlayer) {
      throw new Error("Missing player rating for one or more match players");
    }

    const playerDelta = player.team === "A" ? teamADelta : -teamADelta;
    const won = player.team === input.winningTeam;
    const currentRatingBase =
      currentPlayer.internalMatches > 0 ? currentPlayer.internalElo : player.balanceRating;
    await db
      .update(players)
      .set({
        internalElo: roundInternalElo(currentRatingBase + playerDelta),
        internalMatches: currentPlayer.internalMatches + 1,
        internalWins: currentPlayer.internalWins + (won ? 1 : 0),
        internalLosses: currentPlayer.internalLosses + (won ? 0 : 1),
        internalUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(players.id, player.playerId));

    const targetGuildId = playerGuildIds.get(player.playerId);
    if (targetGuildId) {
      const guildKey = `${targetGuildId}:${player.playerId}`;
      const currentGuildPlayer = currentGuildPlayersByKey.get(guildKey);
      if (currentGuildPlayer) {
        const guildRatingBase =
          currentGuildPlayer.internalMatches > 0
            ? currentGuildPlayer.internalElo
            : player.balanceRating;
        await db
          .update(guildPlayers)
          .set({
            internalElo: roundInternalElo(guildRatingBase + playerDelta),
            internalMatches: currentGuildPlayer.internalMatches + 1,
            internalWins: currentGuildPlayer.internalWins + (won ? 1 : 0),
            internalLosses: currentGuildPlayer.internalLosses + (won ? 0 : 1),
            internalUpdatedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(guildPlayers.guildId, targetGuildId),
              eq(guildPlayers.playerId, player.playerId),
            ),
          );
      }
    }
  }

  await db
    .update(customMatches)
    .set({
      status: "completed",
      winningTeam: input.winningTeam,
      resolutionType,
      updatedAt: now,
    })
    .where(eq(customMatches.id, input.matchId));
}

export function isCustomMatchCaptain(
  match: Pick<CustomMatchRecord, "createdByDiscordUserId" | "opponentCaptainDiscordUserId">,
  userId: string,
): boolean {
  return match.createdByDiscordUserId === userId || match.opponentCaptainDiscordUserId === userId;
}

export async function getActiveCrossGuildMatchForGuild(
  database: DbClient | null | undefined,
  guildId: string,
): Promise<(CustomMatchRecord & { players: CustomMatchPlayerRecord[] }) | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db
    .select({ id: customMatches.id })
    .from(customMatches)
    .where(
      and(
        eq(customMatches.status, "pending_results"),
        eq(customMatches.matchType, "cross_guild"),
        or(eq(customMatches.guildId, guildId), eq(customMatches.opponentGuildId, guildId)),
      ),
    )
    .orderBy(desc(customMatches.createdAt))
    .limit(1);

  const matchId = rows[0]?.id;
  if (!matchId) {
    return null;
  }

  return getCustomMatch(database, matchId);
}

export async function countCompletedMatchesSince(
  database: DbClient | null | undefined,
  guildId: string,
  sinceMs: number,
): Promise<number> {
  if (!database) {
    return 0;
  }

  const db = database;
  const rows = await db
    .select({ id: customMatches.id })
    .from(customMatches)
    .where(
      and(
        eq(customMatches.status, "completed"),
        gte(customMatches.updatedAt, sinceMs),
        or(eq(customMatches.guildId, guildId), eq(customMatches.opponentGuildId, guildId)),
      ),
    );

  return rows.length;
}
