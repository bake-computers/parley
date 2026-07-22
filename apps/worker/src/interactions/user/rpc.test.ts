import { describe, expect, test } from "bun:test";
import { ConnectError } from "@connectrpc/connect";
import type { DeleteUserDataResponse, UserSettingsResponse } from "@parley/proto";
import {
  invokeDeleteUserData,
  invokeGetUserSettings,
  invokeUpsertUserSettings,
} from "#/interactions/user/rpc";

describe("invokeGetUserSettings", () => {
  test("wraps a successful response in Ok", async () => {
    const client = {
      getUserSettings: () =>
        Promise.resolve({
          success: true,
          settings: { discordUserId: "u1" },
        } as unknown as UserSettingsResponse),
    };
    const r = await invokeGetUserSettings(client as never, "u1");
    expect(r.isOk()).toBe(true);
  });

  test("wraps a thrown ConnectError unchanged", async () => {
    const err = new ConnectError("InvalidArgument", 3, {});
    const client = { getUserSettings: () => Promise.reject(err) };
    const r = await invokeGetUserSettings(client as never, "u1");
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error).toBe(err);
    }
  });
});

describe("invokeUpsertUserSettings", () => {
  test("forwards every field through to the client", async () => {
    const calls: unknown[] = [];
    const client = {
      upsertUserSettings: (req: unknown) => {
        calls.push(req);
        return Promise.resolve({ success: true } as unknown as UserSettingsResponse);
      },
    };
    await invokeUpsertUserSettings(
      client as never,
      {
        discordUserId: "u1",
        matchmakingEnabled: false,
        termsAcceptedAtMs: 100,
        profilePublic: false,
      } as never,
    );
    expect(calls).toHaveLength(1);
  });
});

describe("invokeDeleteUserData", () => {
  test("surfaces cooldown_until_ms in the Ok branch", async () => {
    const client = {
      deleteUserData: () =>
        Promise.resolve({
          success: true,
          anonymizedDiscordUserId: "anon",
          cooldownUntilMs: 1234n,
        } as unknown as DeleteUserDataResponse),
    };
    const r = await invokeDeleteUserData(client as never, "u1");
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.cooldownUntilMs).toBe(1234n);
    }
  });
});
