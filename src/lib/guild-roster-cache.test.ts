import { describe, expect, test } from "bun:test";
import {
  buildCachedGuildRosterMembers,
  deleteGuildRosterCache,
  readGuildRosterCache,
  writeGuildRosterCache,
} from "./guild-roster-cache";
import type { GuildRosterEntry } from "./db/guild-roster";

class FakeKV {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe("guild roster cache", () => {
  test("builds ready and pending members from roster entries", () => {
    const roster: GuildRosterEntry[] = [
      {
        guildId: "guild-1",
        discordUserId: "user-1",
        playerId: 1,
        username: "Ready",
        platform: "pc",
        profileUrl: null,
        level: 100,
        registeredAt: 1,
        updatedAt: 2,
        snapshot: {
          fetchedAt: 3,
          rankPoints: 4200,
          kdRatio: 1.1,
          kost: 60,
          headshotPercentage: 45,
          kills: 30,
          deaths: 20,
          payloadJson: JSON.stringify({ ranked_stats: { rounds_played: 40 } }),
        },
      },
      {
        guildId: "guild-1",
        discordUserId: "user-2",
        playerId: 2,
        username: "Pending",
        platform: "xbox",
        profileUrl: null,
        level: 90,
        registeredAt: 1,
        updatedAt: 2,
        snapshot: null,
      },
    ];

    const members = buildCachedGuildRosterMembers(roster);

    expect(members[0]?.ready).toBe(true);
    expect(members[0]?.metrics?.kpr).toBe(0.75);
    expect(members[1]?.ready).toBe(false);
    expect(members[1]?.metrics).toBeNull();
  });

  test("writes, reads, and deletes a cached guild roster", async () => {
    const cache = new FakeKV();
    const members = [
      {
        guildId: "guild-1",
        discordUserId: "user-1",
        playerId: 1,
        username: "Ready",
        platform: "pc",
        profileUrl: null,
        level: 100,
        registeredAt: 1,
        updatedAt: 2,
        ready: true,
        snapshotFetchedAt: 3,
        metrics: {
          rankPoints: 4200,
          kdRatio: 1.1,
          kost: 60,
          kpr: 0.75,
          headshotPercentage: 45,
          seedScore: 226.75,
        },
      },
    ];

    await writeGuildRosterCache(cache as unknown as KVNamespace, "guild-1", members);
    await expect(readGuildRosterCache(cache as unknown as KVNamespace, "guild-1")).resolves.toEqual(
      members,
    );

    await deleteGuildRosterCache(cache as unknown as KVNamespace, "guild-1");
    await expect(
      readGuildRosterCache(cache as unknown as KVNamespace, "guild-1"),
    ).resolves.toBeNull();
  });
});
