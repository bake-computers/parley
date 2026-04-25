import { and, eq } from "drizzle-orm";
import type { D1Database } from "@cloudflare/workers-types";
import { createDb } from "./client";
import { guildPlayers, players, statSnapshots } from "./schema";
import { normalizeStatsLookupValue } from "../stats-rate-limit";
import type { StatsCacheEnvelope } from "../stats-cache";

export interface PlayerRecord {
  id: number;
  profileId: string | null;
  username: string;
  usernameNormalized: string;
  platform: string;
  profileUrl: string | null;
  level: number;
  createdAt: number;
  updatedAt: number;
}

function currentTimestamp() {
  return Date.now();
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizePlayerUsername(username: string): string {
  return normalizeStatsLookupValue(username);
}

export async function upsertRegistrationPlayer(
  database: D1Database,
  input: {
    username: string;
    platform: string;
  },
): Promise<number> {
  const db = createDb(database);
  const now = currentTimestamp();
  const username = input.username.trim();
  const usernameNormalized = normalizePlayerUsername(username);

  await db
    .insert(players)
    .values({
      username,
      usernameNormalized,
      platform: input.platform,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [players.usernameNormalized, players.platform],
      set: {
        username,
        updatedAt: now,
      },
    });

  const row = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(eq(players.usernameNormalized, usernameNormalized), eq(players.platform, input.platform)),
    )
    .limit(1);

  if (!row[0]?.id) {
    throw new Error("Failed to resolve registration player");
  }

  return row[0].id;
}

export async function getPlayerById(
  database: D1Database | null | undefined,
  playerId: number,
): Promise<PlayerRecord | null> {
  if (!database) {
    return null;
  }

  const db = createDb(database);
  const row = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  return row[0] ?? null;
}

export async function resolveStatsEnvelopePlayerId(
  database: D1Database | null | undefined,
  envelope: StatsCacheEnvelope,
): Promise<number | null> {
  if (!database) {
    return null;
  }

  const db = createDb(database);
  const profileId = toOptionalString(envelope.profile.profile_id);
  if (profileId) {
    const byProfileId = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.profileId, profileId))
      .limit(1);
    return byProfileId[0]?.id ?? null;
  }

  const username = toOptionalString(envelope.profile.username) ?? envelope.username;
  const platform = toOptionalString(envelope.profile.platform);
  if (!username || !platform) {
    return null;
  }

  const row = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(
        eq(players.usernameNormalized, normalizePlayerUsername(username)),
        eq(players.platform, platform),
      ),
    )
    .limit(1);

  return row[0]?.id ?? null;
}

export async function reconcileAutoPlayerRegistrations(
  database: D1Database | null | undefined,
  envelope: StatsCacheEnvelope,
): Promise<string[]> {
  if (!database) {
    return [];
  }

  const actualPlayerId = await resolveStatsEnvelopePlayerId(database, envelope);
  const actualPlatform = toOptionalString(envelope.profile.platform);
  const username = toOptionalString(envelope.profile.username) ?? envelope.username;

  if (!actualPlayerId || !actualPlatform || !username) {
    return [];
  }

  const db = createDb(database);
  const normalizedUsername = normalizePlayerUsername(username);
  const placeholderRows = await db
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.usernameNormalized, normalizedUsername), eq(players.platform, "auto")));

  if (placeholderRows.length === 0) {
    const guildIds = await db
      .select({ guildId: guildPlayers.guildId })
      .from(guildPlayers)
      .where(eq(guildPlayers.playerId, actualPlayerId));
    return [...new Set(guildIds.map((row) => row.guildId))];
  }

  const affectedGuildIds = new Set<string>();
  for (const placeholder of placeholderRows) {
    if (placeholder.id === actualPlayerId) {
      continue;
    }

    const links = await db
      .select({ guildId: guildPlayers.guildId })
      .from(guildPlayers)
      .where(eq(guildPlayers.playerId, placeholder.id));
    for (const link of links) {
      affectedGuildIds.add(link.guildId);
    }

    await db
      .update(guildPlayers)
      .set({
        playerId: actualPlayerId,
        updatedAt: currentTimestamp(),
      })
      .where(eq(guildPlayers.playerId, placeholder.id));

    await db
      .update(players)
      .set({
        username,
        usernameNormalized: normalizedUsername,
        platform: actualPlatform,
        profileId: toOptionalString(envelope.profile.profile_id),
        profileUrl: toOptionalString(envelope.profile.profile_url),
        level: toNumber(envelope.profile.level, 0),
        updatedAt: currentTimestamp(),
      })
      .where(eq(players.id, actualPlayerId));
  }

  const actualLinks = await db
    .select({ guildId: guildPlayers.guildId })
    .from(guildPlayers)
    .where(eq(guildPlayers.playerId, actualPlayerId));
  for (const link of actualLinks) {
    affectedGuildIds.add(link.guildId);
  }

  const actualSnapshots = await db
    .select({ id: statSnapshots.id })
    .from(statSnapshots)
    .where(eq(statSnapshots.playerId, actualPlayerId))
    .limit(1);
  if (actualSnapshots.length === 0) {
    await db
      .update(players)
      .set({
        username,
        usernameNormalized: normalizedUsername,
        platform: actualPlatform,
        profileId: toOptionalString(envelope.profile.profile_id),
        profileUrl: toOptionalString(envelope.profile.profile_url),
        level: toNumber(envelope.profile.level, 0),
        updatedAt: currentTimestamp(),
      })
      .where(eq(players.id, actualPlayerId));
  }

  return [...affectedGuildIds];
}
