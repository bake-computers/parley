import { afterEach, describe, expect, test, vi } from "vitest";
import {
  fetchGuildSettings,
  getCachedGuildSettings,
  prefetchGuildSettings,
} from "./guild-settings-cache";

const bundle = {
  general: {
    defaultTeamFormat: "5v5",
    matchmakingEnabled: true,
    autoBalance: false,
    crossGuildMatchmaking: false,
  },
  rules: { minRank: "", maxRank: "", regionLock: "" },
  quota: { dailyMatchCap: 0, weeklyMatchCap: 0 },
  notifications: { matchReady: true, tournamentUpdates: true },
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