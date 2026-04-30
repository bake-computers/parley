import { and, asc, count, desc, eq, inArray, isNotNull, like, lte } from "drizzle-orm";
import type { DbClient } from "./client";
import {
  tournamentBracketMatches,
  tournamentEntries,
  tournamentEntryPlayers,
  tournaments,
} from "./schema";

export type TournamentFormat = "double" | "single";
export type TournamentVisibility = "public";
export type TournamentStatus = "active" | "cancelled" | "completed" | "full_pending_start" | "open";
export type TournamentEntryStatus = "active" | "champion" | "eliminated" | "joined" | "withdrawn";
export type TournamentBracket = "grand_final" | "lower" | "upper";
export type TournamentBracketMatchStatus =
  | "completed"
  | "forfeit"
  | "pending_results"
  | "ready"
  | "waiting";
export type TournamentBracketSlot = "A" | "B";

export interface TournamentRecord {
  id: number;
  name: string;
  nameNormalized: string;
  format: string;
  teamCap: number;
  visibility: string;
  status: string;
  createdByGuildId: string;
  createdByChannelId: string;
  createdByDiscordUserId: string;
  hubMessageId: string | null;
  filledAt: number | null;
  autoStartAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  winnerEntryId: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TournamentEntryRecord {
  id: number;
  tournamentId: number;
  guildId: string;
  channelId: string;
  captainDiscordUserId: string;
  teamName: string;
  teamNameNormalized: string;
  status: string;
  seedNumber: number | null;
  stackBalanceTotal: number;
  stackBalanceAverage: number;
  joinedAt: number;
  eliminatedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TournamentEntryPlayerRecord {
  id: number;
  tournamentId: number;
  entryId: number;
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

export interface TournamentBracketMatchRecord {
  id: number;
  tournamentId: number;
  bracket: string;
  roundNumber: number;
  matchNumber: number;
  status: string;
  entryAId: number | null;
  entryBId: number | null;
  winnerEntryId: number | null;
  loserEntryId: number | null;
  winnerToMatchId: number | null;
  winnerToSlot: string | null;
  loserToMatchId: number | null;
  loserToSlot: string | null;
  customMatchId: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TournamentEntryWithPlayers extends TournamentEntryRecord {
  players: TournamentEntryPlayerRecord[];
}

export interface TournamentWithEntries extends TournamentRecord {
  entries: TournamentEntryWithPlayers[];
}

export interface TournamentAutocompleteRecord {
  id: number;
  name: string;
  nameNormalized: string;
  status: TournamentStatus;
  teamCap: number;
  entryCount: number;
}

function currentTimestamp() {
  return Date.now();
}

async function loadTournamentEntryPlayers(
  database: DbClient,
  entryIds: readonly number[],
): Promise<Map<number, TournamentEntryPlayerRecord[]>> {
  const playersByEntryId = new Map<number, TournamentEntryPlayerRecord[]>();
  if (entryIds.length === 0) {
    return playersByEntryId;
  }

  const db = database;
  const rows = await db
    .select()
    .from(tournamentEntryPlayers)
    .where(inArray(tournamentEntryPlayers.entryId, [...entryIds]))
    .orderBy(asc(tournamentEntryPlayers.entryId), asc(tournamentEntryPlayers.slot));

  for (const row of rows) {
    const players = playersByEntryId.get(row.entryId) ?? [];
    players.push(row);
    playersByEntryId.set(row.entryId, players);
  }

  return playersByEntryId;
}

async function attachTournamentEntryPlayers(
  database: DbClient,
  entries: readonly TournamentEntryRecord[],
): Promise<TournamentEntryWithPlayers[]> {
  if (entries.length === 0) {
    return [];
  }

  const playersByEntryId = await loadTournamentEntryPlayers(
    database,
    entries.map((entry) => entry.id),
  );

  return entries.map((entry) => ({
    ...entry,
    players: playersByEntryId.get(entry.id) ?? [],
  }));
}

export async function createTournament(
  database: DbClient,
  input: {
    name: string;
    nameNormalized: string;
    format: TournamentFormat;
    teamCap: number;
    visibility?: TournamentVisibility;
    status: TournamentStatus;
    createdByGuildId: string;
    createdByChannelId: string;
    createdByDiscordUserId: string;
    hubMessageId?: string | null;
  },
): Promise<number> {
  const db = database;
  const now = currentTimestamp();
  const inserted = await db
    .insert(tournaments)
    .values({
      name: input.name,
      nameNormalized: input.nameNormalized,
      format: input.format,
      teamCap: input.teamCap,
      visibility: input.visibility ?? "public",
      status: input.status,
      createdByGuildId: input.createdByGuildId,
      createdByChannelId: input.createdByChannelId,
      createdByDiscordUserId: input.createdByDiscordUserId,
      hubMessageId: input.hubMessageId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tournaments.id });

  const tournamentId = inserted[0]?.id;
  if (!tournamentId) {
    throw new Error("Failed to create tournament");
  }

  return tournamentId;
}

export async function updateTournamentHubMessageId(
  database: DbClient,
  input: {
    tournamentId: number;
    hubMessageId: string;
  },
): Promise<void> {
  const db = database;
  await db
    .update(tournaments)
    .set({
      hubMessageId: input.hubMessageId,
      updatedAt: currentTimestamp(),
    })
    .where(eq(tournaments.id, input.tournamentId));
}

export async function updateTournament(
  database: DbClient,
  input: {
    tournamentId: number;
    status?: TournamentStatus;
    filledAt?: number | null;
    autoStartAt?: number | null;
    startedAt?: number | null;
    completedAt?: number | null;
    winnerEntryId?: number | null;
  },
): Promise<void> {
  const db = database;
  await db
    .update(tournaments)
    .set({
      status: input.status,
      filledAt: input.filledAt,
      autoStartAt: input.autoStartAt,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      winnerEntryId: input.winnerEntryId,
      updatedAt: currentTimestamp(),
    })
    .where(eq(tournaments.id, input.tournamentId));
}

export async function getTournament(
  database: DbClient | null | undefined,
  tournamentId: number,
): Promise<TournamentRecord | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);

  return rows[0] ?? null;
}

export async function getTournamentWithEntries(
  database: DbClient | null | undefined,
  tournamentId: number,
): Promise<TournamentWithEntries | null> {
  if (!database) {
    return null;
  }

  const tournament = await getTournament(database, tournamentId);
  if (!tournament) {
    return null;
  }

  const entries = await listTournamentEntries(database, tournamentId);
  return {
    ...tournament,
    entries,
  };
}

export async function listPublicTournaments(
  database: DbClient | null | undefined,
  input?: {
    query?: string | null;
    format?: TournamentFormat | null;
    statuses?: TournamentStatus[];
  },
): Promise<TournamentRecord[]> {
  if (!database) {
    return [];
  }

  const db = database;
  const conditions = [eq(tournaments.visibility, "public")];

  if (input?.query) {
    conditions.push(like(tournaments.nameNormalized, `%${input.query}%`));
  }
  if (input?.format) {
    conditions.push(eq(tournaments.format, input.format));
  }
  if (input?.statuses && input.statuses.length > 0) {
    conditions.push(inArray(tournaments.status, input.statuses));
  }

  return db
    .select()
    .from(tournaments)
    .where(and(...conditions))
    .orderBy(desc(tournaments.createdAt), asc(tournaments.id));
}

export async function listPublicTournamentAutocomplete(
  database: DbClient | null | undefined,
  input?: {
    query?: string | null;
    statuses?: TournamentStatus[];
    limit?: number;
  },
): Promise<TournamentAutocompleteRecord[]> {
  if (!database) {
    return [];
  }

  const db = database;
  const limit = Math.max(1, Math.min(25, Math.trunc(input?.limit ?? 25)));
  const conditions = [eq(tournaments.visibility, "public")];

  if (input?.query) {
    conditions.push(like(tournaments.nameNormalized, `%${input.query}%`));
  }

  if (input?.statuses && input.statuses.length > 0) {
    conditions.push(inArray(tournaments.status, input.statuses));
  }

  const rows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      nameNormalized: tournaments.nameNormalized,
      status: tournaments.status,
      teamCap: tournaments.teamCap,
      entryCount: count(tournamentEntries.id),
    })
    .from(tournaments)
    .leftJoin(tournamentEntries, eq(tournamentEntries.tournamentId, tournaments.id))
    .where(and(...conditions))
    .groupBy(
      tournaments.id,
      tournaments.name,
      tournaments.nameNormalized,
      tournaments.status,
      tournaments.teamCap,
      tournaments.createdAt,
    )
    .orderBy(desc(tournaments.createdAt), asc(tournaments.id))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    status: row.status as TournamentStatus,
  }));
}

export async function listOverdueTournamentsDueToAutoStart(
  database: DbClient | null | undefined,
  nowMs = Date.now(),
): Promise<TournamentRecord[]> {
  if (!database) {
    return [];
  }

  const db = database;
  return db
    .select()
    .from(tournaments)
    .where(
      and(
        eq(tournaments.status, "full_pending_start"),
        isNotNull(tournaments.autoStartAt),
        lte(tournaments.autoStartAt, nowMs),
      ),
    )
    .orderBy(asc(tournaments.autoStartAt), asc(tournaments.id));
}

export async function createTournamentEntry(
  database: DbClient,
  input: {
    tournamentId: number;
    guildId: string;
    channelId: string;
    captainDiscordUserId: string;
    teamName: string;
    teamNameNormalized: string;
    status: TournamentEntryStatus;
    stackBalanceTotal: number;
    stackBalanceAverage: number;
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
    .insert(tournamentEntries)
    .values({
      tournamentId: input.tournamentId,
      guildId: input.guildId,
      channelId: input.channelId,
      captainDiscordUserId: input.captainDiscordUserId,
      teamName: input.teamName,
      teamNameNormalized: input.teamNameNormalized,
      status: input.status,
      stackBalanceTotal: input.stackBalanceTotal,
      stackBalanceAverage: input.stackBalanceAverage,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tournamentEntries.id });

  const entryId = inserted[0]?.id;
  if (!entryId) {
    throw new Error("Failed to create tournament entry");
  }

  await db.insert(tournamentEntryPlayers).values(
    input.players.map((player) => ({
      tournamentId: input.tournamentId,
      entryId,
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

  return entryId;
}

export async function getTournamentEntry(
  database: DbClient | null | undefined,
  entryId: number,
): Promise<TournamentEntryWithPlayers | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db
    .select()
    .from(tournamentEntries)
    .where(eq(tournamentEntries.id, entryId))
    .limit(1);
  const entry = rows[0];
  if (!entry) {
    return null;
  }

  return (await attachTournamentEntryPlayers(database, [entry]))[0] ?? null;
}

export async function listTournamentEntries(
  database: DbClient | null | undefined,
  tournamentId: number,
): Promise<TournamentEntryWithPlayers[]> {
  if (!database) {
    return [];
  }

  const db = database;
  const rows = await db
    .select()
    .from(tournamentEntries)
    .where(eq(tournamentEntries.tournamentId, tournamentId))
    .orderBy(asc(tournamentEntries.joinedAt), asc(tournamentEntries.id));

  return attachTournamentEntryPlayers(database, rows);
}

export async function getTournamentEntryForCaptain(
  database: DbClient | null | undefined,
  tournamentId: number,
  captainDiscordUserId: string,
): Promise<TournamentEntryWithPlayers | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db
    .select()
    .from(tournamentEntries)
    .where(
      and(
        eq(tournamentEntries.tournamentId, tournamentId),
        eq(tournamentEntries.captainDiscordUserId, captainDiscordUserId),
      ),
    )
    .limit(1);

  return (await attachTournamentEntryPlayers(database, rows))[0] ?? null;
}

export async function getTournamentEntryByTeamName(
  database: DbClient | null | undefined,
  tournamentId: number,
  teamNameNormalized: string,
): Promise<TournamentEntryWithPlayers | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db
    .select()
    .from(tournamentEntries)
    .where(
      and(
        eq(tournamentEntries.tournamentId, tournamentId),
        eq(tournamentEntries.teamNameNormalized, teamNameNormalized),
      ),
    )
    .limit(1);

  return (await attachTournamentEntryPlayers(database, rows))[0] ?? null;
}

export async function deleteTournamentEntry(database: DbClient, entryId: number): Promise<void> {
  const db = database;
  await db.delete(tournamentEntries).where(eq(tournamentEntries.id, entryId));
}

export async function updateTournamentEntry(
  database: DbClient,
  input: {
    entryId: number;
    status?: TournamentEntryStatus;
    seedNumber?: number | null;
    eliminatedAt?: number | null;
  },
): Promise<void> {
  const db = database;
  await db
    .update(tournamentEntries)
    .set({
      status: input.status,
      seedNumber: input.seedNumber,
      eliminatedAt: input.eliminatedAt,
      updatedAt: currentTimestamp(),
    })
    .where(eq(tournamentEntries.id, input.entryId));
}

export async function updateTournamentEntrySeeds(
  database: DbClient,
  seeds: Array<{
    entryId: number;
    seedNumber: number;
    status?: TournamentEntryStatus;
  }>,
): Promise<void> {
  for (const seed of seeds) {
    await updateTournamentEntry(database, {
      entryId: seed.entryId,
      seedNumber: seed.seedNumber,
      status: seed.status,
    });
  }
}

export async function createTournamentBracketMatches(
  database: DbClient,
  matches: Array<{
    tournamentId: number;
    bracket: TournamentBracket;
    roundNumber: number;
    matchNumber: number;
    status: TournamentBracketMatchStatus;
    entryAId?: number | null;
    entryBId?: number | null;
    winnerEntryId?: number | null;
    loserEntryId?: number | null;
    winnerToMatchId?: number | null;
    winnerToSlot?: TournamentBracketSlot | null;
    loserToMatchId?: number | null;
    loserToSlot?: TournamentBracketSlot | null;
    customMatchId?: number | null;
  }>,
): Promise<number[]> {
  const db = database;
  const now = currentTimestamp();
  const inserted = await db
    .insert(tournamentBracketMatches)
    .values(
      matches.map((match) => ({
        tournamentId: match.tournamentId,
        bracket: match.bracket,
        roundNumber: match.roundNumber,
        matchNumber: match.matchNumber,
        status: match.status,
        entryAId: match.entryAId ?? null,
        entryBId: match.entryBId ?? null,
        winnerEntryId: match.winnerEntryId ?? null,
        loserEntryId: match.loserEntryId ?? null,
        winnerToMatchId: match.winnerToMatchId ?? null,
        winnerToSlot: match.winnerToSlot ?? null,
        loserToMatchId: match.loserToMatchId ?? null,
        loserToSlot: match.loserToSlot ?? null,
        customMatchId: match.customMatchId ?? null,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning({ id: tournamentBracketMatches.id });

  return inserted.map((row) => row.id);
}

export async function listTournamentBracketMatches(
  database: DbClient | null | undefined,
  tournamentId: number,
): Promise<TournamentBracketMatchRecord[]> {
  if (!database) {
    return [];
  }

  const db = database;
  return db
    .select()
    .from(tournamentBracketMatches)
    .where(eq(tournamentBracketMatches.tournamentId, tournamentId))
    .orderBy(
      asc(tournamentBracketMatches.bracket),
      asc(tournamentBracketMatches.roundNumber),
      asc(tournamentBracketMatches.matchNumber),
      asc(tournamentBracketMatches.id),
    );
}

export async function getTournamentBracketMatch(
  database: DbClient | null | undefined,
  bracketMatchId: number,
): Promise<TournamentBracketMatchRecord | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db
    .select()
    .from(tournamentBracketMatches)
    .where(eq(tournamentBracketMatches.id, bracketMatchId))
    .limit(1);

  return rows[0] ?? null;
}

export async function getTournamentBracketMatchByCustomMatchId(
  database: DbClient | null | undefined,
  customMatchId: number,
): Promise<TournamentBracketMatchRecord | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db
    .select()
    .from(tournamentBracketMatches)
    .where(eq(tournamentBracketMatches.customMatchId, customMatchId))
    .limit(1);

  return rows[0] ?? null;
}

export async function updateTournamentBracketMatch(
  database: DbClient,
  input: {
    bracketMatchId: number;
    status?: TournamentBracketMatchStatus;
    entryAId?: number | null;
    entryBId?: number | null;
    winnerEntryId?: number | null;
    loserEntryId?: number | null;
    winnerToMatchId?: number | null;
    winnerToSlot?: TournamentBracketSlot | null;
    loserToMatchId?: number | null;
    loserToSlot?: TournamentBracketSlot | null;
    customMatchId?: number | null;
  },
): Promise<void> {
  const db = database;
  await db
    .update(tournamentBracketMatches)
    .set({
      status: input.status,
      entryAId: input.entryAId,
      entryBId: input.entryBId,
      winnerEntryId: input.winnerEntryId,
      loserEntryId: input.loserEntryId,
      winnerToMatchId: input.winnerToMatchId,
      winnerToSlot: input.winnerToSlot,
      loserToMatchId: input.loserToMatchId,
      loserToSlot: input.loserToSlot,
      customMatchId: input.customMatchId,
      updatedAt: currentTimestamp(),
    })
    .where(eq(tournamentBracketMatches.id, input.bracketMatchId));
}

export async function updateTournamentBracketMatchSlot(
  database: DbClient,
  input: {
    bracketMatchId: number;
    slot: TournamentBracketSlot;
    entryId: number | null;
    status?: TournamentBracketMatchStatus;
  },
): Promise<void> {
  const db = database;
  await db
    .update(tournamentBracketMatches)
    .set({
      entryAId: input.slot === "A" ? input.entryId : undefined,
      entryBId: input.slot === "B" ? input.entryId : undefined,
      status: input.status,
      updatedAt: currentTimestamp(),
    })
    .where(eq(tournamentBracketMatches.id, input.bracketMatchId));
}
