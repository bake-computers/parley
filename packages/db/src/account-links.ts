import { and, eq, inArray } from "drizzle-orm";
import type { DbClient } from "./client";
import { discordAccounts, guildPlayers, players } from "./schema";

export interface AccountLinkRecord {
  discordUserId: string;
  playerId: number;
  username: string;
  platform: string;
  profileUrl: string | null;
  level: number;
  profileId: string | null;
}

export interface LinkDiscordAccountResult {
  linkedGuildIds: string[];
  previousPlayerId: number | null;
}

function currentTimestamp() {
  return Date.now();
}

export async function getAccountLinkByDiscordUserId(
  database: DbClient | null | undefined,
  discordUserId: string,
): Promise<AccountLinkRecord | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db
    .select({
      discordUserId: discordAccounts.discordUserId,
      playerId: discordAccounts.playerId,
      username: players.username,
      platform: players.platform,
      profileUrl: players.profileUrl,
      level: players.level,
      profileId: players.profileId,
    })
    .from(discordAccounts)
    .innerJoin(players, eq(players.id, discordAccounts.playerId))
    .where(eq(discordAccounts.discordUserId, discordUserId))
    .limit(1);

  return rows[0] ?? null;
}

export async function linkDiscordAccount(
  database: DbClient,
  input: {
    guildId: string;
    discordUserId: string;
    playerId: number;
  },
): Promise<LinkDiscordAccountResult> {
  const db = database;
  const now = currentTimestamp();

  const existingPlayerOwner = await db
    .select({
      discordUserId: discordAccounts.discordUserId,
    })
    .from(discordAccounts)
    .where(eq(discordAccounts.playerId, input.playerId))
    .limit(1);

  if (
    existingPlayerOwner[0]?.discordUserId &&
    existingPlayerOwner[0].discordUserId !== input.discordUserId
  ) {
    throw new Error("This R6 account is already linked to another Discord user.");
  }

  const existingGuildPlayer = await db
    .select({
      discordUserId: guildPlayers.discordUserId,
    })
    .from(guildPlayers)
    .where(and(eq(guildPlayers.guildId, input.guildId), eq(guildPlayers.playerId, input.playerId)))
    .limit(1);

  if (
    existingGuildPlayer[0]?.discordUserId &&
    existingGuildPlayer[0].discordUserId !== input.discordUserId
  ) {
    throw new Error("This R6 account is already registered in this server.");
  }

  const existingLink = await db
    .select({
      playerId: discordAccounts.playerId,
    })
    .from(discordAccounts)
    .where(eq(discordAccounts.discordUserId, input.discordUserId))
    .limit(1);

  const previousPlayerId = existingLink[0]?.playerId ?? null;

  await db
    .insert(discordAccounts)
    .values({
      discordUserId: input.discordUserId,
      playerId: input.playerId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: discordAccounts.discordUserId,
      set: {
        playerId: input.playerId,
        updatedAt: now,
      },
    });

  const linkedGuildIds = new Set<string>([input.guildId]);
  if (previousPlayerId !== null && previousPlayerId !== input.playerId) {
    const existingGuildRows = await db
      .select({ guildId: guildPlayers.guildId })
      .from(guildPlayers)
      .where(eq(guildPlayers.discordUserId, input.discordUserId));
    for (const row of existingGuildRows) {
      linkedGuildIds.add(row.guildId);
    }

    await db
      .update(guildPlayers)
      .set({
        playerId: input.playerId,
        updatedAt: now,
      })
      .where(eq(guildPlayers.discordUserId, input.discordUserId));
  }

  await db
    .insert(guildPlayers)
    .values({
      guildId: input.guildId,
      discordUserId: input.discordUserId,
      playerId: input.playerId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [guildPlayers.guildId, guildPlayers.discordUserId],
      set: {
        playerId: input.playerId,
        updatedAt: now,
      },
    });

  return {
    linkedGuildIds: [...linkedGuildIds],
    previousPlayerId,
  };
}

export async function unlinkGuildRegistration(
  database: DbClient,
  input: {
    guildId: string;
    discordUserId: string;
  },
): Promise<{ removedPlayerId: number | null; removedAccount: boolean }> {
  const db = database;
  const current = await db
    .select({ playerId: guildPlayers.playerId })
    .from(guildPlayers)
    .where(
      and(
        eq(guildPlayers.guildId, input.guildId),
        eq(guildPlayers.discordUserId, input.discordUserId),
      ),
    )
    .limit(1);

  if (!current[0]) {
    return {
      removedPlayerId: null,
      removedAccount: false,
    };
  }

  await db
    .delete(guildPlayers)
    .where(
      and(
        eq(guildPlayers.guildId, input.guildId),
        eq(guildPlayers.discordUserId, input.discordUserId),
      ),
    );

  const remaining = await db
    .select({ guildId: guildPlayers.guildId })
    .from(guildPlayers)
    .where(eq(guildPlayers.discordUserId, input.discordUserId))
    .limit(1);

  let removedAccount = false;
  if (remaining.length === 0) {
    await db.delete(discordAccounts).where(eq(discordAccounts.discordUserId, input.discordUserId));
    removedAccount = true;
  }

  return {
    removedPlayerId: current[0].playerId,
    removedAccount,
  };
}

export async function listGuildIdsForDiscordUserId(
  database: DbClient | null | undefined,
  discordUserId: string,
): Promise<string[]> {
  if (!database) {
    return [];
  }

  const db = database;
  const rows = await db
    .select({ guildId: guildPlayers.guildId })
    .from(guildPlayers)
    .where(eq(guildPlayers.discordUserId, discordUserId));

  return [...new Set(rows.map((row) => row.guildId))];
}

export async function listGuildIdsForPlayerIds(
  database: DbClient | null | undefined,
  playerIds: readonly number[],
): Promise<string[]> {
  if (!database || playerIds.length === 0) {
    return [];
  }

  const db = database;
  const rows = await db
    .select({ guildId: guildPlayers.guildId })
    .from(guildPlayers)
    .where(inArray(guildPlayers.playerId, [...playerIds]));

  return [...new Set(rows.map((row) => row.guildId))];
}

export async function getGuildRegistrationByDiscordUserId(
  database: DbClient | null | undefined,
  guildId: string,
  discordUserId: string,
): Promise<{ guildId: string; discordUserId: string; playerId: number } | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db
    .select({
      guildId: guildPlayers.guildId,
      discordUserId: guildPlayers.discordUserId,
      playerId: guildPlayers.playerId,
    })
    .from(guildPlayers)
    .where(and(eq(guildPlayers.guildId, guildId), eq(guildPlayers.discordUserId, discordUserId)))
    .limit(1);

  return rows[0] ?? null;
}
