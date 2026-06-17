import { describe, expect, test } from "bun:test";
import { ConnectError } from "@connectrpc/connect";
import { Game } from "@parley/proto";
import type { GuildNotificationSettingsResponse } from "@parley/proto";
import {
  invokeGetNotificationSettings,
  invokeUpsertNotificationSettings,
} from "./rpc.js";

describe("invokeGetNotificationSettings", () => {
  test("wraps a successful response in Ok", async () => {
    const client = {
      getNotificationSettings: () =>
        Promise.resolve({
          success: true,
          settings: { guildId: "g1", game: Game.R6 },
        } as unknown as GuildNotificationSettingsResponse),
    };
    const r = await invokeGetNotificationSettings(client as never, "g1");
    expect(r.isOk()).toBe(true);
  });

  test("wraps a thrown ConnectError unchanged", async () => {
    const err = new ConnectError("InvalidArgument", 3, {});
    const client = { getNotificationSettings: () => Promise.reject(err) };
    const r = await invokeGetNotificationSettings(client as never, "g1");
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error).toBe(err);
    }
  });
});

describe("invokeUpsertNotificationSettings", () => {
  test("forwards settings through to the client", async () => {
    const calls: unknown[] = [];
    const client = {
      upsertNotificationSettings: (req: unknown) => {
        calls.push(req);
        return Promise.resolve({ success: true } as unknown as GuildNotificationSettingsResponse);
      },
    };
    await invokeUpsertNotificationSettings(
      client as never,
      {
        guildId: "g1",
        game: Game.R6,
        matchResultsChannel: "ch1",
        tournamentAnnouncementsChannel: "ch2",
        leaderboardUpdatesEnabled: true,
        updatedAtMs: 100n,
        crossGuildAnnouncementsEnabled: false,
        announceMatchReadyEnabled: true,
        announceMatchResultsEnabled: true,
      } as never,
    );
    expect(calls).toHaveLength(1);
  });

  test("wraps a thrown ConnectError unchanged", async () => {
    const err = new ConnectError("NotFound", 5, {});
    const client = { upsertNotificationSettings: () => Promise.reject(err) };
    const r = await invokeUpsertNotificationSettings(
      client as never,
      {
        guildId: "g1",
        game: Game.R6,
        matchResultsChannel: "",
        tournamentAnnouncementsChannel: "",
        leaderboardUpdatesEnabled: false,
        updatedAtMs: 0n,
        crossGuildAnnouncementsEnabled: false,
        announceMatchReadyEnabled: false,
        announceMatchResultsEnabled: false,
      } as never,
    );
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error).toBe(err);
    }
  });
});
