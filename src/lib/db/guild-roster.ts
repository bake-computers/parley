import { desc, eq } from "drizzle-orm";
import type { D1Database } from "@cloudflare/workers-types";
import { createDb } from "./client";
import { guildPlayers, players, statSnapshots } from "./schema";

export interface GuildRosterSeedSnapshot {
  fetchedAt: number;
  rankPoints: number;
  kdRatio: number;
  kost: number;
  headshotPercentage: number;
  kills: number;
  deaths: number;
  payloadJson: string;
}

export interface GuildRosterEntry {
  guildId: string;
  discordUserId: string;
  playerId: number;
  username: string;
  platform: string;
  profileUrl: string | null;
  level: number;
  internalElo: number;
  internalMatches: number;
  internalWins: number;
  internalLosses: number;
  internalUpdatedAt: number | null;
  registeredAt: number;
  updatedAt: number;
  snapshot: GuildRosterSeedSnapshot | null;
}

export async function listGuildRoster(
  database: D1Database | null | undefined,
  guildId: string,
): Promise<GuildRosterEntry[]> {
  if (!database) {
    return [];
  }

  const db = createDb(database);
  const rows = await db
    .select({
      guildId: guildPlayers.guildId,
      discordUserId: guildPlayers.discordUserId,
      playerId: guildPlayers.playerId,
      username: players.username,
      platform: players.platform,
      profileUrl: players.profileUrl,
      level: players.level,
      internalElo: players.internalElo,
      internalMatches: players.internalMatches,
      internalWins: players.internalWins,
      internalLosses: players.internalLosses,
      internalUpdatedAt: players.internalUpdatedAt,
      registeredAt: guildPlayers.createdAt,
      updatedAt: guildPlayers.updatedAt,
      snapshotFetchedAt: statSnapshots.fetchedAt,
      snapshotRankPoints: statSnapshots.rankPoints,
      snapshotKdRatio: statSnapshots.kdRatio,
      snapshotKost: statSnapshots.kost,
      snapshotHeadshotPercentage: statSnapshots.headshotPercentage,
      snapshotKills: statSnapshots.kills,
      snapshotDeaths: statSnapshots.deaths,
      snapshotPayloadJson: statSnapshots.payloadJson,
    })
    .from(guildPlayers)
    .innerJoin(players, eq(players.id, guildPlayers.playerId))
    .leftJoin(statSnapshots, eq(statSnapshots.playerId, guildPlayers.playerId))
    .where(eq(guildPlayers.guildId, guildId))
    .orderBy(desc(statSnapshots.fetchedAt), guildPlayers.discordUserId);

  const entries = new Map<string, GuildRosterEntry>();
  for (const row of rows) {
    if (entries.has(row.discordUserId)) {
      continue;
    }

    entries.set(row.discordUserId, {
      guildId: row.guildId,
      discordUserId: row.discordUserId,
      playerId: row.playerId,
      username: row.username,
      platform: row.platform,
      profileUrl: row.profileUrl,
      level: row.level,
      internalElo: row.internalElo,
      internalMatches: row.internalMatches,
      internalWins: row.internalWins,
      internalLosses: row.internalLosses,
      internalUpdatedAt: row.internalUpdatedAt,
      registeredAt: row.registeredAt,
      updatedAt: row.updatedAt,
      snapshot:
        typeof row.snapshotFetchedAt === "number"
          ? {
              fetchedAt: row.snapshotFetchedAt,
              rankPoints: row.snapshotRankPoints ?? 0,
              kdRatio: row.snapshotKdRatio ?? 0,
              kost: row.snapshotKost ?? 0,
              headshotPercentage: row.snapshotHeadshotPercentage ?? 0,
              kills: row.snapshotKills ?? 0,
              deaths: row.snapshotDeaths ?? 0,
              payloadJson: row.snapshotPayloadJson ?? "{}",
            }
          : null,
    });
  }

  return [...entries.values()].sort((left, right) => left.username.localeCompare(right.username));
}

export async function listGuildIdsForPlayerId(
  database: D1Database | null | undefined,
  playerId: number,
): Promise<string[]> {
  if (!database) {
    return [];
  }

  const db = createDb(database);
  const rows = await db
    .select({ guildId: guildPlayers.guildId })
    .from(guildPlayers)
    .where(eq(guildPlayers.playerId, playerId));
  return [...new Set(rows.map((row) => row.guildId))];
}

export async function hasGuildReadyRosterCount(
  database: D1Database | null | undefined,
  guildId: string,
): Promise<number> {
  const roster = await listGuildRoster(database, guildId);
  return roster.filter((entry) => entry.snapshot !== null).length;
}

export async function resolvePlayerSnapshotByGuildUser(
  database: D1Database | null | undefined,
  guildId: string,
  discordUserId: string,
): Promise<GuildRosterEntry | null> {
  if (!database) {
    return null;
  }

  const roster = await listGuildRoster(database, guildId);
  return roster.find((entry) => entry.discordUserId === discordUserId) ?? null;
}
