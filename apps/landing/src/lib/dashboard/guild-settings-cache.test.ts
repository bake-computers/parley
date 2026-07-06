import { afterEach, describe, expect, test, vi } from "vitest";
import {
  fetchGuildSettings,
  getCachedGuildSettings,
  prefetchGuildSettings,
} from "./guild-settings-cache";

const bundle = {
  general: {
    guildId: "guild-1",
    game: 1,
    defaultTeamFormat: "5v5",
    matchmakingEnabled: true,
    autoBalance: false,
    crossGuildMatchmaking: false,
    updatedAtMs: 0,
    updatedByDiscordUserId: "user-1",
  },
  matchmakingRules: {
    guildId: "guild-1",
    game: 1,
    minElo: 0,
    maxElo: 0,
    platforms: [],
    requireVerified: false,
    maxEloGap: 0,
    updatedAtMs: 0,
  },
  matchQuota: {
    guildId: "guild-1",
    game: 1,
    dailyMatchLimit: 0,
    updatedByDiscordUserId: "user-1",
    updatedAtMs: 0,
  },
};

describe("guild-settings-cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("prefetch populates cache for subsequent reads", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(bundle), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    prefetchGuildSettings("guild-1");
    await vi.waitFor(() => expect(getCachedGuildSettings("guild-1")).not.toBeNull());

    await fetchGuildSettings("guild-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});