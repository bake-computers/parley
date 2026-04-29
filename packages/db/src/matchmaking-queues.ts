import { and, asc, eq, inArray, lt } from "drizzle-orm";
import type { DbClient } from "./client";
import { matchmakingQueuePlayers, matchmakingQueues } from "./schema";

export type MatchmakingQueueStatus = "cancelled" | "expired" | "matched" | "queued";

export interface MatchmakingQueueRecord {
  id: number;
  guildId: string;
  channelId: string;
  captainDiscordUserId: string;
  status: string;
  playerCount: number;
  stackBalanceTotal: number;
  stackBalanceAverage: number;
  matchedMatchId: number | null;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface MatchmakingQueuePlayerRecord {
  id: number;
  queueId: number;
  discordUserId: string;
  playerId: number;
  slot: number;
  username: string;
  platform: string;
  balanceRating: number;
  seedRankPoints: number;
  seedKdRatio: number;
  seedKost: number;
  seedKpr: number;
  seedHeadshotPercentage: number;
  seedScore: number;
  createdAt: number;
  updatedAt: number;
}

export interface MatchmakingQueueWithPlayers extends MatchmakingQueueRecord {
  players: MatchmakingQueuePlayerRecord[];
}

function currentTimestamp() {
  return Date.now();
}

async function loadQueuePlayers(
  database: DbClient,
  queueIds: readonly number[],
): Promise<Map<number, MatchmakingQueuePlayerRecord[]>> {
  const playersByQueueId = new Map<number, MatchmakingQueuePlayerRecord[]>();
  if (queueIds.length === 0) {
    return playersByQueueId;
  }

  const db = database;
  const rows = await db
    .select()
    .from(matchmakingQueuePlayers)
    .where(inArray(matchmakingQueuePlayers.queueId, [...queueIds]))
    .orderBy(asc(matchmakingQueuePlayers.queueId), asc(matchmakingQueuePlayers.slot));

  for (const row of rows) {
    const players = playersByQueueId.get(row.queueId) ?? [];
    players.push(row);
    playersByQueueId.set(row.queueId, players);
  }

  return playersByQueueId;
}

async function attachPlayers(
  database: DbClient,
  queues: readonly MatchmakingQueueRecord[],
): Promise<MatchmakingQueueWithPlayers[]> {
  if (queues.length === 0) {
    return [];
  }

  const playersByQueueId = await loadQueuePlayers(
    database,
    queues.map((queue) => queue.id),
  );

  return queues.map((queue) => ({
    ...queue,
    players: playersByQueueId.get(queue.id) ?? [],
  }));
}

export async function createMatchmakingQueue(
  database: DbClient,
  input: {
    guildId: string;
    channelId: string;
    captainDiscordUserId: string;
    status: MatchmakingQueueStatus;
    playerCount: number;
    stackBalanceTotal: number;
    stackBalanceAverage: number;
    expiresAt: number;
    matchedMatchId?: number | null;
    players: Array<{
      discordUserId: string;
      playerId: number;
      slot: number;
      username: string;
      platform: string;
      balanceRating: number;
      seedRankPoints: number;
      seedKdRatio: number;
      seedKost: number;
      seedKpr: number;
      seedHeadshotPercentage: number;
      seedScore: number;
    }>;
  },
): Promise<number> {
  const db = database;
  const now = currentTimestamp();
  const inserted = await db
    .insert(matchmakingQueues)
    .values({
      guildId: input.guildId,
      channelId: input.channelId,
      captainDiscordUserId: input.captainDiscordUserId,
      status: input.status,
      playerCount: input.playerCount,
      stackBalanceTotal: input.stackBalanceTotal,
      stackBalanceAverage: input.stackBalanceAverage,
      matchedMatchId: input.matchedMatchId ?? null,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: matchmakingQueues.id });

  const queueId = inserted[0]?.id;
  if (!queueId) {
    throw new Error("Failed to create matchmaking queue");
  }

  await db.insert(matchmakingQueuePlayers).values(
    input.players.map((player) => ({
      queueId,
      discordUserId: player.discordUserId,
      playerId: player.playerId,
      slot: player.slot,
      username: player.username,
      platform: player.platform,
      balanceRating: player.balanceRating,
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

  return queueId;
}

export async function getMatchmakingQueue(
  database: DbClient | null | undefined,
  queueId: number,
): Promise<MatchmakingQueueWithPlayers | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db
    .select()
    .from(matchmakingQueues)
    .where(eq(matchmakingQueues.id, queueId))
    .limit(1);
  const queue = rows[0];
  if (!queue) {
    return null;
  }

  return (await attachPlayers(database, [queue]))[0] ?? null;
}

export async function getActiveMatchmakingQueueForGuild(
  database: DbClient | null | undefined,
  guildId: string,
): Promise<MatchmakingQueueWithPlayers | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db
    .select()
    .from(matchmakingQueues)
    .where(and(eq(matchmakingQueues.guildId, guildId), eq(matchmakingQueues.status, "queued")))
    .orderBy(asc(matchmakingQueues.createdAt))
    .limit(1);

  return (await attachPlayers(database, rows))[0] ?? null;
}

export async function getActiveMatchmakingQueueForCaptain(
  database: DbClient | null | undefined,
  captainDiscordUserId: string,
): Promise<MatchmakingQueueWithPlayers | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db
    .select()
    .from(matchmakingQueues)
    .where(
      and(
        eq(matchmakingQueues.captainDiscordUserId, captainDiscordUserId),
        eq(matchmakingQueues.status, "queued"),
      ),
    )
    .orderBy(asc(matchmakingQueues.createdAt))
    .limit(1);

  return (await attachPlayers(database, rows))[0] ?? null;
}

export async function listQueuedMatchmakingQueues(
  database: DbClient | null | undefined,
): Promise<MatchmakingQueueWithPlayers[]> {
  if (!database) {
    return [];
  }

  const db = database;
  const rows = await db
    .select()
    .from(matchmakingQueues)
    .where(eq(matchmakingQueues.status, "queued"))
    .orderBy(asc(matchmakingQueues.createdAt));

  return attachPlayers(database, rows);
}

async function updateMatchmakingQueueStatus(
  database: DbClient,
  input: {
    queueId: number;
    status: MatchmakingQueueStatus;
    matchedMatchId?: number | null;
  },
): Promise<void> {
  const db = database;
  await db
    .update(matchmakingQueues)
    .set({
      status: input.status,
      matchedMatchId: input.matchedMatchId ?? null,
      updatedAt: currentTimestamp(),
    })
    .where(eq(matchmakingQueues.id, input.queueId));
}

export async function markMatchmakingQueueMatched(
  database: DbClient,
  input: {
    queueId: number;
    matchId: number;
  },
): Promise<void> {
  await updateMatchmakingQueueStatus(database, {
    queueId: input.queueId,
    status: "matched",
    matchedMatchId: input.matchId,
  });
}

export async function cancelMatchmakingQueue(database: DbClient, queueId: number): Promise<void> {
  await updateMatchmakingQueueStatus(database, { queueId, status: "cancelled" });
}

export async function expireStaleMatchmakingQueues(
  database: DbClient | null | undefined,
  nowMs = Date.now(),
): Promise<void> {
  if (!database) {
    return;
  }

  const db = database;
  await db
    .update(matchmakingQueues)
    .set({
      status: "expired",
      updatedAt: nowMs,
    })
    .where(and(eq(matchmakingQueues.status, "queued"), lt(matchmakingQueues.expiresAt, nowMs)));
}
