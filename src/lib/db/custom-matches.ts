import { and, eq, gte } from "drizzle-orm";
import type { D1Database } from "@cloudflare/workers-types";
import { createDb } from "./client";
import { customMatchPlayers, customMatches, players } from "./schema";

export type CustomMatchStatus = "cancelled" | "completed" | "pending_results";
export type CustomMatchTeam = "A" | "B";

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
  kills: number | null;
  deaths: number | null;
  createdAt: number;
  updatedAt: number;
  username?: string;
}

export interface CustomMatchRecord {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string;
  createdByDiscordUserId: string;
  status: string;
  teamASeedTotal: number;
  teamBSeedTotal: number;
  seedGap: number;
  createdAt: number;
  updatedAt: number;
}

function currentTimestamp() {
  return Date.now();
}

export async function createCustomMatch(
  database: D1Database,
  input: {
    guildId: string;
    channelId: string;
    messageId: string;
    createdByDiscordUserId: string;
    status: CustomMatchStatus;
    teamASeedTotal: number;
    teamBSeedTotal: number;
    seedGap: number;
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
    }>;
  },
): Promise<number> {
  const db = createDb(database);
  const now = currentTimestamp();
  const inserted = await db
    .insert(customMatches)
    .values({
      guildId: input.guildId,
      channelId: input.channelId,
      messageId: input.messageId,
      createdByDiscordUserId: input.createdByDiscordUserId,
      status: input.status,
      teamASeedTotal: input.teamASeedTotal,
      teamBSeedTotal: input.teamBSeedTotal,
      seedGap: input.seedGap,
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
      createdAt: now,
      updatedAt: now,
    })),
  );

  return matchId;
}

export async function updateCustomMatchMessageId(
  database: D1Database,
  input: {
    matchId: number;
    messageId: string;
  },
): Promise<void> {
  const db = createDb(database);
  await db
    .update(customMatches)
    .set({
      messageId: input.messageId,
      updatedAt: currentTimestamp(),
    })
    .where(eq(customMatches.id, input.matchId));
}

export async function getCustomMatch(
  database: D1Database | null | undefined,
  matchId: number,
): Promise<(CustomMatchRecord & { players: CustomMatchPlayerRecord[] }) | null> {
  if (!database) {
    return null;
  }

  const db = createDb(database);
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
      kills: customMatchPlayers.kills,
      deaths: customMatchPlayers.deaths,
      createdAt: customMatchPlayers.createdAt,
      updatedAt: customMatchPlayers.updatedAt,
      username: players.username,
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
  database: D1Database,
  input: {
    matchId: number;
    resultsByDiscordUserId: ReadonlyMap<string, { kills: number; deaths: number }>;
  },
): Promise<void> {
  const db = createDb(database);
  const now = currentTimestamp();
  const match = await getCustomMatch(database, input.matchId);
  if (!match) {
    throw new Error("Custom match not found");
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

  await db
    .update(customMatches)
    .set({
      status: "completed",
      updatedAt: now,
    })
    .where(eq(customMatches.id, input.matchId));
}

export async function countCompletedMatchesSince(
  database: D1Database | null | undefined,
  guildId: string,
  sinceMs: number,
): Promise<number> {
  if (!database) {
    return 0;
  }

  const db = createDb(database);
  const rows = await db
    .select({ id: customMatches.id })
    .from(customMatches)
    .where(
      and(
        eq(customMatches.guildId, guildId),
        eq(customMatches.status, "completed"),
        gte(customMatches.updatedAt, sinceMs),
      ),
    );

  return rows.length;
}
