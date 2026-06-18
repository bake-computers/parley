import { describe, expect, test } from "bun:test";
import { ok, type Result } from "neverthrow";
import type { JsonValue, DiscordApiError } from "@parley/runtime";
import type { UserSettingsResponse, UserSettings as ProtoUserSettings } from "@parley/proto";
import {
  assertAccepted,
  buildAcceptanceCard,
  ACCEPT_BUTTON,
  acceptCustomId,
  parseAcceptSource,
} from "./acceptance.js";

const ENV = { ENGINE_SERVICE_URL: "http://localhost:50051" };

type Reply = (options: {
  components?: unknown[];
  flags?: number;
}) => Promise<Result<JsonValue, DiscordApiError>>;

function captureReply() {
  const replyCalls: Parameters<Reply>[0][] = [];
  const editCalls: Parameters<Reply>[0][] = [];
  const ctxStore = new Map<string, unknown>();
  let deferred = false;
    const interaction = {
    user: { id: "u1" },
    commandName: "user",
    get deferred() {
      return deferred;
    },
    replied: false,
    context: {
      get: <T>(key: string) => ctxStore.get(key) as T | undefined,
      set: <T>(key: string, value: T) => {
        ctxStore.set(key, value);
      },
      env: ENV,
    },
    deferReply: () => {
      deferred = true;
      return Promise.resolve(ok({} as JsonValue) as Result<JsonValue, DiscordApiError>);
    },
    reply: ((options: Parameters<Reply>[0], _force?: boolean) => {
      replyCalls.push(options);
      return Promise.resolve(ok({} as JsonValue) as Result<JsonValue, DiscordApiError>);
    }) as unknown as Parameters<typeof assertAccepted>[0]["reply"],
    editReply: ((options: Parameters<Reply>[0]) => {
      editCalls.push(options);
      return Promise.resolve(ok({} as JsonValue) as Result<JsonValue, DiscordApiError>);
    }) as unknown as Parameters<typeof assertAccepted>[0]["editReply"],
  };
  return {
    replyCalls,
    editCalls,
    interaction: interaction as unknown as Parameters<typeof assertAccepted>[0],
  };
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
    const { replyCalls, editCalls, interaction } = captureReply();
    const result = await assertAccepted(interaction, ENV, fakeClient as never);
    expect(result).toBe(true);
    expect(replyCalls).toHaveLength(0);
    expect(editCalls).toHaveLength(0);
  });

  test("returns false and replies with the acceptance card when not accepted", async () => {
    const fakeClient = {
      getUserSettings: () =>
        Promise.resolve({
          success: true,
          settings: userSettings(0),
        } as unknown as UserSettingsResponse),
    };
    const { replyCalls, editCalls, interaction } = captureReply();
    const result = await assertAccepted(interaction, ENV, fakeClient as never);
    expect(result).toBe(false);
    expect(replyCalls).toHaveLength(0);
    expect(editCalls).toHaveLength(1);
    expect(editCalls[0]?.flags).toBeDefined();
  });

  test("fails open and returns true on RPC error", async () => {
    const fakeClient = {
      getUserSettings: () => Promise.reject(new Error("engine down")),
    };
    const { replyCalls, editCalls, interaction } = captureReply();
    const result = await assertAccepted(interaction, ENV, fakeClient as never);
    expect(result).toBe(true);
    expect(replyCalls).toHaveLength(0);
    expect(editCalls).toHaveLength(0);
  });
});

describe("buildAcceptanceCard", () => {
  test("emits the Accept & Continue button with the source command in customId", () => {
    const card = buildAcceptanceCard({} as never, "link").toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain(`"custom_id":"${acceptCustomId("link")}"`);
  });

  test("parseAcceptSource recovers the originating command", () => {
    expect(parseAcceptSource(acceptCustomId("history"))).toBe("history");
    expect(parseAcceptSource(ACCEPT_BUTTON)).toBe("user");
  });

  test("accept button is in an action row, not an empty section", () => {
    const card = buildAcceptanceCard({} as never).toJSON();
    const components = card["components"] as { type: number; components?: unknown[] }[];
    expect(components.some((c) => c.type === 9)).toBe(false);
    const row = components.find((c) => c.type === 1);
    expect(row?.components).toHaveLength(1);
  });
});
