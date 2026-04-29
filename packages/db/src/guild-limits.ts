import { eq } from "drizzle-orm";
import type { DbClient } from "./client";
import { guildLimits } from "./schema";

export interface GuildLimitRecord {
  guildId: string;
  dailyMatchLimit: number;
  updatedByDiscordUserId: string;
  createdAt: number;
  updatedAt: number;
}

function currentTimestamp() {
  return Date.now();
}

export async function getGuildLimit(
  database: DbClient | null | undefined,
  guildId: string,
): Promise<GuildLimitRecord | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db.select().from(guildLimits).where(eq(guildLimits.guildId, guildId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertGuildLimit(
  database: DbClient,
  input: {
    guildId: string;
    dailyMatchLimit: number;
    updatedByDiscordUserId: string;
  },
): Promise<void> {
  const db = database;
  const now = currentTimestamp();
  await db
    .insert(guildLimits)
    .values({
      guildId: input.guildId,
      dailyMatchLimit: input.dailyMatchLimit,
      updatedByDiscordUserId: input.updatedByDiscordUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: guildLimits.guildId,
      set: {
        dailyMatchLimit: input.dailyMatchLimit,
        updatedByDiscordUserId: input.updatedByDiscordUserId,
        updatedAt: now,
      },
    });
}

export async function clearGuildLimit(database: DbClient, guildId: string): Promise<void> {
  const db = database;
  await db.delete(guildLimits).where(eq(guildLimits.guildId, guildId));
}
