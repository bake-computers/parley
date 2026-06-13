import { describe, expect, test } from "bun:test";
import { describe as describeEngine, test as testEngine } from "bun:test";
import { ComponentType, InteractionResponseType } from "discord-api-types/v10";
import type { Fetcher } from "@cloudflare/workers-types";
import { ok, type Result } from "neverthrow";
import { parseCustomId, type DiscordApiError, type JsonValue } from "@parley/runtime";
import { resolveEngineTransport } from "../../engine-transport.js";
import { COMPONENTS_V2_EPHEMERAL, editReplyV2, replyV2, updateV2 } from "../../ui/discord.js";
import {
  buildPlatformSelectCard,
  buildConfirmCard,
  buildErrorCard,
  buildFetchingStatsCard,
  buildReadyToPlayCard,
  buildSuccessCard,
} from "./ui.js";
import { buildUsernameModal } from "./modal.js";
import { confirmCustomId, platformCustomId, usernameModalCustomId } from "./constants.js";

const EMPTY_EMOJIS = {};

type CapturedPayload = {
  components?: unknown[];
  flags?: number;
  embeds?: unknown[];
};

type ReplyInteraction = Parameters<typeof replyV2>[0];
type UpdateInteraction = Parameters<typeof updateV2>[0];
type EditInteraction = Parameters<typeof editReplyV2>[0];

function captureReply(): {
  calls: CapturedPayload[];
  interaction: ReplyInteraction;
} {
  const calls: CapturedPayload[] = [];
  const interaction = {
    reply: ((options: CapturedPayload, _forceEphemeral?: boolean) => {
      calls.push(options);
      return Promise.resolve(ok({} as JsonValue) as Result<JsonValue, DiscordApiError>);
    }) as unknown as ReplyInteraction["reply"],
  };
  return { calls, interaction };
}

function captureUpdate(returnedType: number = InteractionResponseType.UpdateMessage): {
  calls: CapturedPayload[];
  interaction: UpdateInteraction;
} {
  const calls: CapturedPayload[] = [];
  const captured = {
    update: ((options: CapturedPayload) => {
      calls.push(options);
      return Promise.resolve(
        ok({ type: returnedType } as JsonValue) as Result<JsonValue, DiscordApiError>,
      );
    }) as unknown as UpdateInteraction["update"],
  };
  return { calls, interaction: captured };
}

function captureEdit(): { calls: CapturedPayload[]; interaction: EditInteraction } {
  const calls: CapturedPayload[] = [];
  const captured = {
    editReply: ((options: CapturedPayload, _messageId?: string) => {
      calls.push(options);
      return Promise.resolve(ok({} as JsonValue) as Result<JsonValue, DiscordApiError>);
    }) as unknown as EditInteraction["editReply"],
  };
  return { calls, interaction: captured };
}

describe("link/ui — platform select card", () => {
  test("renders one button per platform with link/platform/* customIds", () => {
    const card = buildPlatformSelectCard(EMPTY_EMOJIS).toJSON();
    expect(card.type).toBe(ComponentType.Container);

    const sections = card["components"] as { type: number; accessory?: { custom_id?: string } }[];
    const accessoryIds = sections
      .map((section) => section.accessory?.custom_id)
      .filter((id): id is string => typeof id === "string");

    expect(accessoryIds).toContain(platformCustomId("pc"));
    expect(accessoryIds).toContain(platformCustomId("xbox"));
    expect(accessoryIds).toContain(platformCustomId("playstation"));
  });
});

describe("link/ui — confirm card", () => {
  test("Continue button customId round-trips username via query param", () => {
    const card = buildConfirmCard("pc", "TestUser", EMPTY_EMOJIS).toJSON();
    const sections = card["components"] as { accessory?: { custom_id?: string } }[];

    const continueId = sections
      .map((s) => s.accessory?.custom_id)
      .find((id): id is string => typeof id === "string" && id.startsWith("link/confirm/"));
    expect(continueId).toBeDefined();
    if (!continueId) {
      throw new TypeError("expected a continue button customId");
    }

    const parsed = parseCustomId(continueId);
    expect(typeof parsed).toBe("object");
    if (typeof parsed === "string") {
      throw new TypeError("expected parsed customId to be an object");
    }
    expect(parsed.path[1]).toBe("confirm");
    expect(parsed.path[2]).toBe("pc");
    expect(parsed.params.get("username")).toBe("TestUser");
  });

  test("url-encodes the username in the customId", () => {
    const id = confirmCustomId("xbox", "Player One#1234");
    const parsed = parseCustomId(id);
    if (typeof parsed === "string") {
      throw new TypeError("expected object");
    }
    expect(parsed.params.get("username")).toBe("Player One#1234");
  });
});

describe("link/ui — success and error cards", () => {
  test("success card shows normalized username, player id, platform label", () => {
    const card = buildSuccessCard("normalized", 42, "playstation", EMPTY_EMOJIS).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("normalized");
    expect(text).toContain("42");
    expect(text).toContain("PlayStation");
  });

  test("error card surfaces the provided message", () => {
    const card = buildErrorCard("Username not found", EMPTY_EMOJIS).toJSON();
    expect(JSON.stringify(card)).toContain("Username not found");
  });

  test("fetching stats card explains the wait and points at /profile for retry", () => {
    const card = buildFetchingStatsCard(EMPTY_EMOJIS).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("Fetching Your Stats");
    expect(text).toMatch(/can take a while|upstream provider/i);
  });

  test("ready-to-play card surfaces level and current rank from stats", () => {
    const card = buildReadyToPlayCard(
      {
        usernameNormalized: "normalized",
        playerId: 42,
        platform: "pc",
        stats: {
          $typeName: "parley.stats.v1.FetchStatsResponse",
          success: true,
          stats: {
            $typeName: "parley.stats.v1.ScrapedStats",
            profile: {
              $typeName: "parley.stats.v1.StatsProfile",
              username: "normalized",
              level: 250,
              profileId: "abc",
              platform: "pc",
              profileUrl: "",
            },
            rankedStats: {
              $typeName: "parley.stats.v1.RankedStats",
              currentRank: "Diamond",
              rankPoints: 4500,
              season: "Y9S1",
            },
          },
        },
      } as never,
      EMPTY_EMOJIS,
    ).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("Ready To Play");
    expect(text).toContain("Level 250");
    expect(text).toContain("Diamond");
    expect(text).toContain("4500");
  });

  test("ready-to-play card falls back to a hint when stats are empty", () => {
    const card = buildReadyToPlayCard(
      {
        usernameNormalized: "normalized",
        playerId: 42,
        platform: "pc",
        stats: {
          $typeName: "parley.stats.v1.FetchStatsResponse",
          success: true,
        },
      } as never,
      EMPTY_EMOJIS,
    ).toJSON();
    const text = JSON.stringify(card);
    expect(text).toMatch(/No stats available|profile/i);
  });
});

describe("link/modal — username modal", () => {
  test("modal customId encodes the chosen platform", () => {
    const modal = buildUsernameModal("pc").toJSON();
    expect(modal["custom_id"]).toBe(usernameModalCustomId("pc"));
    expect(modal["title"]).toBeDefined();
    const rows = modal["components"] as { components: { custom_id?: string }[] }[];
    const input = rows[0]?.components[0];
    expect(input?.custom_id).toBe("link/username-input");
  });

  test("modal customId is distinct from the button prefix so routing works", () => {
    const modalCustomId = usernameModalCustomId("playstation");
    const modalPrefix = parseCustomId(modalCustomId, true);
    const buttonCustomId = platformCustomId("playstation");
    const buttonPrefix = parseCustomId(buttonCustomId, true);
    expect(modalPrefix).not.toBe(buttonPrefix);
  });
});

describe("replyV2 — Components v2 flag (slash /link entry)", () => {
  test("always sets IsComponentsV2 (32768) on outgoing payloads", async () => {
    const { calls, interaction } = captureReply();
    const result = await replyV2(interaction, buildPlatformSelectCard(EMPTY_EMOJIS), true);
    expect(result.isErr()).toBe(false);
    const options = calls[0];
    if (!options) {
      throw new TypeError("expected replyV2 to call interaction.reply");
    }
    expect(options.flags).toBe(COMPONENTS_V2_EPHEMERAL);
    const flags = options.flags ?? 0;
    expect(flags & 32768).toBe(32768);
    expect(flags & 64).toBe(64);
  });

  test("omits the embeds field so Discord doesn't reject the V2 message", async () => {
    const { calls, interaction } = captureReply();
    await replyV2(interaction, buildPlatformSelectCard(EMPTY_EMOJIS), true);
    const options = calls[0];
    if (!options) {
      throw new TypeError("expected replyV2 to call interaction.reply");
    }
    expect(options.embeds).toBeUndefined();
    expect(options.components).toBeDefined();
    expect((options.components as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("updateV2 — modal submit to confirm card", () => {
  test("posts InteractionResponseType.UpdateMessage (7) with V2 flag", async () => {
    const { calls, interaction } = captureUpdate();
    const result = await updateV2(interaction, buildPlatformSelectCard(EMPTY_EMOJIS));
    expect(result.isOk()).toBe(true);
    const options = calls[0];
    if (!options) {
      throw new TypeError("expected updateV2 to call interaction.update");
    }
    expect(options.flags).toBe(COMPONENTS_V2_EPHEMERAL);
    const flags = options.flags ?? 0;
    expect(flags & 32768).toBe(32768);
    expect(flags & 64).toBe(64);
    expect(options.embeds).toBeUndefined();
    expect((options.components as unknown[]).length).toBeGreaterThan(0);
  });

  test("rejects payloads that did not come back as type 7 — guards against accidental webhook edit", async () => {
    const { interaction } = captureUpdate(InteractionResponseType.ChannelMessageWithSource);
    await expect(updateV2(interaction, buildPlatformSelectCard(EMPTY_EMOJIS))).rejects.toThrow(
      /UpdateMessage/,
    );
  });

  test("returns Ok when the runtime confirms type 7", async () => {
    const { interaction } = captureUpdate(InteractionResponseType.UpdateMessage);
    const result = await updateV2(interaction, buildPlatformSelectCard(EMPTY_EMOJIS));
    expect(result.isOk()).toBe(true);
  });
});

describe("editReplyV2 — confirm/cancel/error/success after deferUpdate", () => {
  test("posts V2 components via the webhook PATCH (editReply) endpoint", async () => {
    const { calls, interaction } = captureEdit();
    const result = await editReplyV2(interaction, buildPlatformSelectCard(EMPTY_EMOJIS));
    expect(result.isErr()).toBe(false);
    const options = calls[0];
    if (!options) {
      throw new TypeError("expected editReplyV2 to call interaction.editReply");
    }
    expect(options.flags).toBe(COMPONENTS_V2_EPHEMERAL);
    const flags = options.flags ?? 0;
    expect(flags & 32768).toBe(32768);
    expect(flags & 64).toBe(64);
    expect(options.embeds).toBeUndefined();
    expect((options.components as unknown[]).length).toBeGreaterThan(0);
  });
});

describeEngine("resolveEngineTransport — USE_LOCAL_ENGINE override", () => {
  const vpcFetcher = {
    fetch: () => Promise.resolve(new Response("vpc")),
  } as unknown as Fetcher;

  testEngine("with USE_LOCAL_ENGINE=1, ignores VPC and uses localhost", async () => {
    const config = resolveEngineTransport({
      VPC_SERVICE: vpcFetcher,
      ENGINE_INTERNAL_URL: "http://api.internal.parley.bot:50051",
      ENGINE_SERVICE_URL: "http://localhost:50051",
      USE_LOCAL_ENGINE: "1",
    });
    expect(config.baseUrl).toBe("http://localhost:50051");
    expect(config.cacheKey).toBe("local:http://localhost:50051");
  });

  testEngine("without USE_LOCAL_ENGINE, prefers VPC when binding is present", () => {
    const config = resolveEngineTransport({
      VPC_SERVICE: vpcFetcher,
      ENGINE_INTERNAL_URL: "http://api.internal.parley.bot:50051",
      ENGINE_SERVICE_URL: "http://localhost:50051",
    });
    expect(config.baseUrl).toBe("http://api.internal.parley.bot:50051");
    expect(config.cacheKey.startsWith("vpc:")).toBe(true);
  });

  testEngine("falls back to localhost when no VPC binding and no override", () => {
    const config = resolveEngineTransport({
      ENGINE_SERVICE_URL: "http://localhost:50051",
    });
    expect(config.baseUrl).toBe("http://localhost:50051");
    expect(config.cacheKey).toBe("local:http://localhost:50051");
  });

  testEngine("falls back to default localhost when nothing is set", () => {
    const config = resolveEngineTransport({});
    expect(config.baseUrl).toBe("http://localhost:50051");
  });

  testEngine("USE_LOCAL_ENGINE accepts truthy spellings", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on"]) {
      const config = resolveEngineTransport({
        VPC_SERVICE: vpcFetcher,
        ENGINE_INTERNAL_URL: "http://api.internal.parley.bot:50051",
        USE_LOCAL_ENGINE: value,
      });
      expect(config.baseUrl).toBe("http://localhost:50051");
    }
  });
});
