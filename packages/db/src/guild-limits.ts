import { eq } from "drizzle-orm";
import type { D1Database } from "@cloudflare/workers-types";
import { createDb } from "./client";
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
  database: D1Database | null | undefined,
  guildId: string,
): Promise<GuildLimitRecord | null> {
  if (!database) {
    return null;
  }

  const db = createDb(database);
  const rows = await db.select().from(guildLimits).where(eq(guildLimits.guildId, guildId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertGuildLimit(
  database: D1Database,
  input: {
    guildId: string;
    dailyMatchLimit: number;
    updatedByDiscordUserId: string;
  },
): Promise<void> {
  const db = createDb(database);
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

export async function clearGuildLimit(database: D1Database, guildId: string): Promise<void> {
  const db = createDb(database);
  await db.delete(guildLimits).where(eq(guildLimits.guildId, guildId));
}
