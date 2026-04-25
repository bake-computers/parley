import type { D1Database } from "@cloudflare/workers-types";
import {
  buildCachedGuildRosterMembers,
  readGuildRosterCache,
  writeGuildRosterCache,
  type CachedGuildRosterMember,
} from "./guild-roster-cache";
import { listGuildRoster } from "./db/guild-roster";

export async function getOrBuildGuildRoster(
  cache: KVNamespace | null | undefined,
  database: D1Database | null | undefined,
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
