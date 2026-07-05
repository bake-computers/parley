import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { resolveTargets } from "./resolveTargets.js";
import { buildMessage } from "./buildMessage.js";
import { postChannelMessage } from "./postChannelMessage.js";
import type { NotificationSettings, NotifyPayload } from "./types.js";
import type { DiscordApiError } from "@parley/runtime";
import { ContainerBuilder, EmbedBuilder } from "@parley/runtime";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LOGO_URL = "https://parley.bot/parley-logo.svg";

function hostSettings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    guildId: "host-guild",
    game: "r6",
    matchResultsChannel: "111",
    tournamentAnnouncementsChannel: "222",
    crossGuildAnnouncementsEnabled: false,
    announceMatchReadyEnabled: true,
    announceMatchResultsEnabled: true,
    ...overrides,
  };
}

function matchReadyPayload(overrides: Partial<NotifyPayload> = {}): NotifyPayload {
  return {
    event: "match.ready",
    game: "r6",
    match_id: "m-1",
    host_guild_id: "host-guild",
    public_uuid: "abc-123",
    participant_guild_ids: ["host-guild", "other-guild"],
    ...overrides,
  };
}

function tournamentPayload(overrides: Partial<NotifyPayload> = {}): NotifyPayload {
  return {
    event: "tournament.started",
    game: "r6",
    tournament_id: "t-1",
    host_guild_id: "host-guild",
    participant_guild_ids: ["host-guild"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveTargets
// ---------------------------------------------------------------------------

describe("resolveTargets", () => {
  test("returns host guild target when channel is set and toggle is on", () => {
    const targets = resolveTargets(matchReadyPayload(), hostSettings(), () => undefined);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual({ guildId: "host-guild", channelId: "111" });
  });

  test("returns empty when match.ready toggle is off", () => {
    const targets = resolveTargets(
      matchReadyPayload(),
      hostSettings({ announceMatchReadyEnabled: false }),
      () => undefined,
    );
    expect(targets).toHaveLength(0);
  });

  test("returns empty when match_results_channel is empty", () => {
    const targets = resolveTargets(
      matchReadyPayload(),
      hostSettings({ matchResultsChannel: "" }),
      () => undefined,
    );
    expect(targets).toHaveLength(0);
  });

  test("routes tournament events to tournament_announcements_channel", () => {
    const targets = resolveTargets(tournamentPayload(), hostSettings(), () => undefined);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual({ guildId: "host-guild", channelId: "222" });
  });

  test("returns empty for tournament when tournament channel is empty", () => {
    const targets = resolveTargets(
      tournamentPayload(),
      hostSettings({ tournamentAnnouncementsChannel: "" }),
      () => undefined,
    );
    expect(targets).toHaveLength(0);
  });

  test("includes cross-guild targets when flag is enabled", () => {
    const otherSettings: NotificationSettings = {
      guildId: "other-guild",
      game: "r6",
      matchResultsChannel: "333",
      tournamentAnnouncementsChannel: "",
      crossGuildAnnouncementsEnabled: false,
      announceMatchReadyEnabled: true,
      announceMatchResultsEnabled: true,
    };

    const targets = resolveTargets(
      matchReadyPayload(),
      hostSettings({ crossGuildAnnouncementsEnabled: true }),
      (guildId) => (guildId === "other-guild" ? otherSettings : undefined),
    );

    expect(targets).toHaveLength(2);
    expect(targets[0]).toEqual({ guildId: "host-guild", channelId: "111" });
    expect(targets[1]).toEqual({ guildId: "other-guild", channelId: "333" });
  });

  test("excludes host from cross-guild to avoid duplicate", () => {
    const targets = resolveTargets(
      matchReadyPayload({ participant_guild_ids: ["host-guild"] }),
      hostSettings({ crossGuildAnnouncementsEnabled: true }),
      () => undefined,
    );

    // Only host — cross-guild would re-add host but it's excluded
    expect(targets).toHaveLength(1);
    expect(targets[0]!.guildId).toBe("host-guild");
  });

  test("skips cross-guild guilds with no settings available", () => {
    const targets = resolveTargets(
      matchReadyPayload(),
      hostSettings({ crossGuildAnnouncementsEnabled: true }),
      () => undefined, // no settings for other-guild
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]!.guildId).toBe("host-guild");
  });

  test("skips cross-guild guilds when their channel is empty", () => {
    const otherSettings: NotificationSettings = {
      guildId: "other-guild",
      game: "r6",
      matchResultsChannel: "", // empty
      tournamentAnnouncementsChannel: "",
      crossGuildAnnouncementsEnabled: false,
      announceMatchReadyEnabled: true,
      announceMatchResultsEnabled: true,
    };

    const targets = resolveTargets(
      matchReadyPayload(),
      hostSettings({ crossGuildAnnouncementsEnabled: true }),
      () => otherSettings,
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]!.guildId).toBe("host-guild");
  });

  test("match.result respects announce_match_results_enabled toggle", () => {
    const targets = resolveTargets(
      matchReadyPayload({ event: "match.result" }),
      hostSettings({ announceMatchResultsEnabled: false }),
      () => undefined,
    );
    expect(targets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildMessage
// ---------------------------------------------------------------------------

describe("buildMessage", () => {
  test("match.ready container has accent color and components", () => {
    const { container } = buildMessage("match.ready", matchReadyPayload());
    const json = container.toJSON();
    expect(json["accent_color"]).toBe(0x8a8a8e);
    expect(Array.isArray(json["components"])).toBe(true);
    // 4 components: header, separator, body, footer
    expect((json["components"] as unknown[]).length).toBe(4);
  });

  test("embed contains logo URL in thumbnail and footer", () => {
    const { embed } = buildMessage("match.ready", matchReadyPayload());
    const json = embed.toJSON() as Record<string, unknown>;
    expect((json["thumbnail"] as { url: string }).url).toBe(LOGO_URL);
    expect((json["footer"] as { icon_url: string }).icon_url).toBe(LOGO_URL);
  });

  test("embed includes match_id field", () => {
    const { embed } = buildMessage("match.ready", matchReadyPayload());
    const json = embed.toJSON() as Record<string, unknown>;
    const fields = json["fields"] as Array<{ name: string; value: string }>;
    expect(fields.some((f) => f.name === "Match ID" && f.value === "m-1")).toBe(true);
  });

  test("embed includes tournament_id field", () => {
    const { embed } = buildMessage("tournament.started", tournamentPayload());
    const json = embed.toJSON() as Record<string, unknown>;
    const fields = json["fields"] as Array<{ name: string; value: string }>;
    expect(fields.some((f) => f.name === "Tournament ID" && f.value === "t-1")).toBe(true);
  });

  test("embed title matches event type", () => {
    const { embed: ready } = buildMessage("match.ready", matchReadyPayload());
    expect((ready.toJSON() as Record<string, unknown>)["title"]).toContain("Match Ready");

    const { embed: result } = buildMessage(
      "match.result",
      matchReadyPayload({ event: "match.result" }),
    );
    expect((result.toJSON() as Record<string, unknown>)["title"]).toContain("Match Result");

    const { embed: reg } = buildMessage(
      "tournament.registration_open",
      tournamentPayload({ event: "tournament.registration_open" }),
    );
    expect((reg.toJSON() as Record<string, unknown>)["title"]).toContain("Registration Open");
  });

  test("description contains match link when public_uuid is set", () => {
    const { embed } = buildMessage("match.ready", matchReadyPayload());
    const desc = (embed.toJSON() as Record<string, unknown>)["description"] as string;
    expect(desc).toContain("https://parley.bot/matches/abc-123");
  });

  test("description omits match link when public_uuid is undefined", () => {
    const { embed } = buildMessage("match.ready", matchReadyPayload({ public_uuid: undefined }));
    const desc = (embed.toJSON() as Record<string, unknown>)["description"] as string;
    expect(desc).not.toContain("parley.bot/matches");
  });

  test("match.result uses warning color", () => {
    const { embed } = buildMessage("match.result", matchReadyPayload({ event: "match.result" }));
    expect((embed.toJSON() as Record<string, unknown>)["color"]).toBe(0xf59e0b);
  });

  test("tournament.champion uses warning color", () => {
    const { embed } = buildMessage(
      "tournament.champion",
      tournamentPayload({ event: "tournament.champion" }),
    );
    expect((embed.toJSON() as Record<string, unknown>)["color"]).toBe(0xf59e0b);
  });
});

// ---------------------------------------------------------------------------
// postChannelMessage
// ---------------------------------------------------------------------------

describe("postChannelMessage", () => {
  function mockClient(handler: (method: string, path: string, body: unknown) => unknown) {
    return {
      request: (method: string, path: string, body?: unknown) =>
        Promise.resolve(handler(method, path, body)),
    } as unknown as import("@parley/runtime").DiscordRestClient;
  }

  test("returns ok when v2 container succeeds", async () => {
    const client = mockClient(() => ok({ id: "msg-1" }));
    const container = new ContainerBuilder();
    const embed = new EmbedBuilder();

    const result = await postChannelMessage(client, "ch-1", container, embed);
    expect(result.isOk()).toBe(true);
  });

  test("falls back to embed when v2 is rejected with 400", async () => {
    let callCount = 0;
    const client = mockClient((_method, _path, _body) => {
      callCount++;
      if (callCount === 1) {
        // First call (v2) fails
        return err({
          kind: "discord-api",
          method: "POST",
          path: "/channels/ch-1/messages",
          status: 400,
          message: "Invalid Form Body",
          retryable: false,
        } satisfies DiscordApiError);
      }
      // Second call (embed fallback) succeeds
      return ok({ id: "msg-2" });
    });

    const container = new ContainerBuilder();
    const embed = new EmbedBuilder();

    const result = await postChannelMessage(client, "ch-1", container, embed);
    expect(result.isOk()).toBe(true);
    expect(callCount).toBe(2);
  });

  test("returns err when both v2 and embed fail", async () => {
    const client = mockClient(() =>
      err({
        kind: "discord-api",
        method: "POST",
        path: "/channels/ch-1/messages",
        status: 403,
        message: "Missing Permissions",
        retryable: false,
      } satisfies DiscordApiError),
    );

    const container = new ContainerBuilder();
    const embed = new EmbedBuilder();

    const result = await postChannelMessage(client, "ch-1", container, embed);
    expect(result.isErr()).toBe(true);
  });

  test("does not retry on non-component errors (e.g. 429)", async () => {
    let callCount = 0;
    const client = mockClient(() => {
      callCount++;
      return err({
        kind: "discord-api",
        method: "POST",
        path: "/channels/ch-1/messages",
        status: 429,
        message: "Rate Limited",
        retryable: true,
      } satisfies DiscordApiError);
    });

    const container = new ContainerBuilder();
    const embed = new EmbedBuilder();

    const result = await postChannelMessage(client, "ch-1", container, embed);
    expect(result.isErr()).toBe(true);
    expect(callCount).toBe(1); // no retry for 429
  });
});
