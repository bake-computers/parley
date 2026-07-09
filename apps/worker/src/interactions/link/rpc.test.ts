import { describe, expect, test } from "bun:test";
import { ConnectError } from "@connectrpc/connect";
import { Game, StatsPlatform } from "@parley/proto";
import type {
  LinkAccountResponse,
  UnlinkAccountResponse,
} from "@parley/proto/identity/v1/identity_pb.js";
import type { FetchStatsResponse } from "@parley/proto/stats/v1/stats_pb.js";
import { invokeFetchStats, invokeLinkAccount, platformToStatsPlatform } from "#/interactions/link/rpc";

const ARGS = {
  discordUserId: "123456789",
  game: Game.R6,
  username: "TestUser",
  platform: "pc",
};

function fakeResponse(): LinkAccountResponse {
  return {
    success: true,
    playerId: 42,
    usernameNormalized: "testuser",
  } as unknown as LinkAccountResponse;
}

describe("invokeLinkAccount", () => {
  test("wraps a successful response in Ok", async () => {
    const calls: unknown[] = [];
    const client = {
      linkAccount: (req: typeof ARGS) => {
        calls.push(req);
        return Promise.resolve(fakeResponse());
      },
      unlinkAccount: () =>
        Promise.resolve({
          success: true,
          removed: 0,
          cooldownUntilMs: 0n,
        } as unknown as UnlinkAccountResponse),
    };

    const result = await invokeLinkAccount(client, ARGS);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.playerId).toBe(42);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(ARGS);
  });

  test("forwards a thrown ConnectError unchanged as Err", async () => {
    const original = new ConnectError("InvalidArgument: username is required", 3, {});
    const client = {
      linkAccount: () => Promise.reject(original),
      unlinkAccount: () =>
        Promise.resolve({
          success: true,
          removed: 0,
          cooldownUntilMs: 0n,
        } as unknown as UnlinkAccountResponse),
    };

    const result = await invokeLinkAccount(client, ARGS);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(original);
      expect(result.error.message).toContain("InvalidArgument");
    }
  });

  test("wraps a non-Connect throw as a ConnectError(Unknown)", async () => {
    const client = {
      linkAccount: () => Promise.reject(new Error("network blew up")),
      unlinkAccount: () =>
        Promise.resolve({
          success: true,
          removed: 0,
          cooldownUntilMs: 0n,
        } as unknown as UnlinkAccountResponse),
    };

    const result = await invokeLinkAccount(client, ARGS);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ConnectError);
      expect(result.error.message).toContain("network blew up");
    }
  });

  test("passes guildId through when provided", async () => {
    const calls: unknown[] = [];
    const client = {
      linkAccount: (req: typeof ARGS) => {
        calls.push(req);
        return Promise.resolve(fakeResponse());
      },
      unlinkAccount: () =>
        Promise.resolve({
          success: true,
          removed: 0,
          cooldownUntilMs: 0n,
        } as unknown as UnlinkAccountResponse),
    };

    await invokeLinkAccount(client, { ...ARGS, guildId: "guild-1" });
    expect((calls[0] as { guildId?: string }).guildId).toBe("guild-1");
  });
});

const STATS_ARGS = {
  username: "TestUser",
  platform: StatsPlatform.PC,
  game: Game.R6,
};

function fakeStatsResponse(): FetchStatsResponse {
  return {
    success: true,
    stats: {
      profile: {
        username: "TestUser",
        level: 200,
        profileId: "abc",
        platform: "pc",
        profileUrl: "",
      },
      rankedStats: { currentRank: "Diamond", rankPoints: 4200, season: "Y9S1" },
    },
  } as unknown as FetchStatsResponse;
}

describe("invokeFetchStats", () => {
  test("wraps a successful response in Ok", async () => {
    const calls: unknown[] = [];
    const client = {
      fetchStats: (req: typeof STATS_ARGS) => {
        calls.push(req);
        return Promise.resolve(fakeStatsResponse());
      },
    };

    const result = await invokeFetchStats(client, STATS_ARGS);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.stats?.profile?.level).toBe(200);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(STATS_ARGS);
  });

  test("forwards a thrown ConnectError as Err unchanged", async () => {
    const original = new ConnectError("Unavailable: stats.cc timeout", 14, {});
    const client = {
      fetchStats: () => Promise.reject(original),
    };

    const result = await invokeFetchStats(client, STATS_ARGS);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(original);
    }
  });

  test("wraps a non-Connect throw as ConnectError", async () => {
    const client = {
      fetchStats: () => Promise.reject(new Error("socket hangup")),
    };

    const result = await invokeFetchStats(client, STATS_ARGS);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ConnectError);
      expect(result.error.message).toContain("socket hangup");
    }
  });
});

describe("platformToStatsPlatform", () => {
  test("maps each wizard platform to the matching StatsPlatform enum", () => {
    expect(platformToStatsPlatform("pc")).toBe(StatsPlatform.PC);
    expect(platformToStatsPlatform("xbox")).toBe(StatsPlatform.XBOX);
    expect(platformToStatsPlatform("playstation")).toBe(StatsPlatform.PLAYSTATION);
  });
});
