import type { KVNamespace } from "@cloudflare/workers-types";
import type { DbClient } from "@parley/db/client";
import {
  buildCachedGuildRosterMembers,
  readGuildRosterCache,
  writeGuildRosterCache,
  type CachedGuildRosterMember,
} from "./rosterCache";
import { listGuildRoster } from "@parley/db/guild-roster";

export async function getOrBuildGuildRoster(
  cache: KVNamespace | null | undefined,
  database: DbClient | null | undefined,
  guildId: string,
): Promise<CachedGuildRosterMember[]> {
  const cached = await readGuildRosterCache(cache, guildId);
  if (cached) {
    return cached;
  }

  const roster = await listGuildRoster(database, guildId);
  const members = buildCachedGuildRosterMembers(roster);
  await writeGuildRosterCache(cache, guildId, members);
  return members;
}
