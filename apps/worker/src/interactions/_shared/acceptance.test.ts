import { describe, expect, test } from "bun:test";
import { ok, type Result } from "neverthrow";
import type { JsonValue, DiscordApiError } from "@parley/runtime";
import type { UserSettingsResponse, UserSettings as ProtoUserSettings } from "@parley/proto";
import { assertAccepted, buildAcceptanceCard, ACCEPT_BUTTON } from "./acceptance.js";

const ENV = { ENGINE_SERVICE_URL: "http://localhost:50051" };

type Reply = (options: {
  components?: unknown[];
  flags?: number;
}) => Promise<Result<JsonValue, DiscordApiError>>;

function captureReply() {
  const calls: Parameters<Reply>[0][] = [];
  const ctxStore = new Map<string, unknown>();
  const interaction = {
    user: { id: "u1" },
    context: {
      get: <T>(key: string) => ctxStore.get(key) as T | undefined,
      set: <T>(key: string, value: T) => {
        ctxStore.set(key, value);
      },
      env: ENV,
    },
    reply: ((options: Parameters<Reply>[0], _force?: boolean) => {
      calls.push(options);
      return Promise.resolve(ok({} as JsonValue) as Result<JsonValue, DiscordApiError>);
    }) as unknown as Parameters<typeof assertAccepted>[0]["reply"],
  };
  return { calls, interaction: interaction as unknown as Parameters<typeof assertAccepted>[0] };
}

function userSettings(termsAcceptedAtMs: number): ProtoUserSettings {
  return {
    $typeName: "parley.user.v1.UserSettings",
    discordUserId: "u1",
    language: 1,
    updatedAtMs: 0,
    matchmakingEnabled: true,
    termsAcceptedAtMs,
    profilePublic: true,
    timezone: "UTC",
  } as unknown as ProtoUserSettings;
}

describe("assertAccepted", () => {
  test("returns true and does not reply when the user has accepted", async () => {
    const fakeClient = {
      getUserSettings: () =>
        Promise.resolve({
          success: true,
          settings: userSettings(Date.now()),
        } as unknown as UserSettingsResponse),
    };
    const { calls, interaction } = captureReply();
    const result = await assertAccepted(interaction, ENV, fakeClient as never);
    expect(result).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test("returns false and replies with the acceptance card when not accepted", async () => {
    const fakeClient = {
      getUserSettings: () =>
        Promise.resolve({
          success: true,
          settings: userSettings(0),
        } as unknown as UserSettingsResponse),
    };
    const { calls, interaction } = captureReply();
    const result = await assertAccepted(interaction, ENV, fakeClient as never);
    expect(result).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.flags).toBeDefined();
  });

  test("fails open and returns true on RPC error", async () => {
    const fakeClient = {
      getUserSettings: () => Promise.reject(new Error("engine down")),
    };
    const { calls, interaction } = captureReply();
    const result = await assertAccepted(interaction, ENV, fakeClient as never);
    expect(result).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("buildAcceptanceCard", () => {
  test("emits the Accept & Continue button with the expected customId", () => {
    const card = buildAcceptanceCard({} as never).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain(`"custom_id":"${ACCEPT_BUTTON}"`);
  });
});
