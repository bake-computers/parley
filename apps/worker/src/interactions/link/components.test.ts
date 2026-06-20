import { describe, expect, test } from "bun:test";
import { describe as describeEngine, test as testEngine } from "bun:test";
import { ComponentType, InteractionResponseType } from "discord-api-types/v10";
import type { Fetcher } from "@cloudflare/workers-types";
import { ok, type Result } from "neverthrow";
import { parseCustomId, type DiscordApiError, type JsonValue } from "@parley/runtime";
import { resolveEngineTransport } from "../../engine-transport.js";
import { COMPONENTS_V2_EPHEMERAL, editReplyV2, replyV2, updateV2 } from "../../ui/discord.js";
import {
  buildLinkHubCard,
  buildConfirmCard,
  buildErrorCard,
  buildFetchingStatsCard,
  buildReadyToPlayCard,
  buildSuccessCard,
  buildUnlinkCooldownCard,
} from "./ui.js";
import {
  CONFIRM_ACTION_CONTINUE,
  PLATFORM_SELECT_CUSTOM_ID,
  UNLINK_SELECT_CUSTOM_ID,
  confirmSelectCustomId,
  usernameModalCustomId,
} from "./constants.js";
import { buildUsernameModal } from "./modal.js";

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

describe("link/ui — hub card", () => {
  test("renders platform and unlink select menus when empty", () => {
    const card = buildLinkHubCard([], EMPTY_EMOJIS).toJSON();
    expect(card.type).toBe(ComponentType.Container);
    const text = JSON.stringify(card);
    expect(text).toContain(PLATFORM_SELECT_CUSTOM_ID);
    expect(text).not.toContain(UNLINK_SELECT_CUSTOM_ID);
  });

  test("shows unlink select when accounts are linked", () => {
    const card = buildLinkHubCard(
      [
        {
          $typeName: "parley.identity.v1.LinkedIdentity",
          game: 1,
          discordUserId: "u1",
          playerId: 9,
          username: "Player",
          usernameNormalized: "player",
          platform: "pc",
          profileId: "",
          profileUrl: "",
          internalElo: 2563,
          internalMatches: 0,
          internalWins: 0,
          internalLosses: 0,
        } as never,
      ],
      EMPTY_EMOJIS,
    ).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain(UNLINK_SELECT_CUSTOM_ID);
    expect(text).toContain("Gold");
  });

  test("hides already-linked platforms from add menu", () => {
    const card = buildLinkHubCard(
      [
        {
          $typeName: "parley.identity.v1.LinkedIdentity",
          game: 1,
          discordUserId: "u1",
          playerId: 9,
          username: "Player",
          usernameNormalized: "player",
          platform: "pc",
          profileId: "",
          profileUrl: "",
          internalElo: 1000,
          internalMatches: 0,
          internalWins: 0,
          internalLosses: 0,
        } as never,
      ],
      EMPTY_EMOJIS,
    ).toJSON();
    const rows = card["components"] as { type: number; components?: { custom_id?: string; options?: { value: string }[] }[] }[];
    const platformSelect = rows
      .flatMap((row) => row.components ?? [])
      .find((c) => c.custom_id === PLATFORM_SELECT_CUSTOM_ID);
    const values = platformSelect?.options?.map((o) => o.value) ?? [];
    expect(values).toEqual(["xbox", "playstation"]);
  });
});

describe("link/ui — confirm card", () => {
  test("confirm select customId round-trips username via query param", () => {
    const card = buildConfirmCard("pc", "TestUser", EMPTY_EMOJIS).toJSON();
    const text = JSON.stringify(card);
    const id = confirmSelectCustomId("pc", "TestUser");
    expect(text).toContain(id);

    const parsed = parseCustomId(id);
    expect(typeof parsed).toBe("object");
    if (typeof parsed === "string") {
      throw new TypeError("expected parsed customId to be an object");
    }
    expect(parsed.path[2]).toBe("pc");
    expect(parsed.params.get("username")).toBe("TestUser");
  });

  test("confirm select includes continue and back values", () => {
    const card = buildConfirmCard("xbox", "Player One", EMPTY_EMOJIS).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain(CONFIRM_ACTION_CONTINUE);
    expect(text).toContain("back");
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

  test("cooldown card renders a discord timestamp", () => {
    const until = Date.UTC(2024, 5, 1);
    const card = buildUnlinkCooldownCard(until, EMPTY_EMOJIS).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("Re-link Cooldown");
    expect(text).toContain(`<t:${Math.floor(until / 1000)}:R>`);
  });

  test("fetching stats card explains the wait", () => {
    const card = buildFetchingStatsCard(EMPTY_EMOJIS).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("Fetching Your Stats");
    expect(text).toMatch(/stats\.cc|moment/i);
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
  });
});

describe("link/modal — username modal", () => {
  test("modal customId encodes the chosen platform", () => {
    const modal = buildUsernameModal("pc").toJSON();
    expect(modal["custom_id"]).toBe(usernameModalCustomId("pc"));
    const rows = modal["components"] as { components: { custom_id?: string }[] }[];
    expect(rows[0]?.components[0]?.custom_id).toBe("link/username-input");
  });
});

describe("replyV2 — Components v2 flag (slash /link entry)", () => {
  test("always sets IsComponentsV2 (32768) on outgoing payloads", async () => {
    const { calls, interaction } = captureReply();
    const result = await replyV2(interaction, buildLinkHubCard([], EMPTY_EMOJIS), true);
    expect(result.isErr()).toBe(false);
    const options = calls[0];
    if (!options) {
      throw new TypeError("expected replyV2 to call interaction.reply");
    }
    expect(options.flags).toBe(COMPONENTS_V2_EPHEMERAL);
  });
});

describe("updateV2 — modal submit to confirm card", () => {
  test("posts InteractionResponseType.UpdateMessage (7) with V2 flag", async () => {
    const { calls, interaction } = captureUpdate();
    const result = await updateV2(interaction, buildConfirmCard("pc", "user", EMPTY_EMOJIS));
    expect(result.isOk()).toBe(true);
    const options = calls[0];
    if (!options) {
      throw new TypeError("expected updateV2 to call interaction.update");
    }
    expect(options.flags).toBe(COMPONENTS_V2_EPHEMERAL);
  });
});

describe("editReplyV2 — deferred select handlers", () => {
  test("posts V2 components via the webhook PATCH (editReply) endpoint", async () => {
    const { calls, interaction } = captureEdit();
    const result = await editReplyV2(interaction, buildLinkHubCard([], EMPTY_EMOJIS));
    expect(result.isErr()).toBe(false);
    const options = calls[0];
    if (!options) {
      throw new TypeError("expected editReplyV2 to call interaction.editReply");
    }
    expect(options.flags).toBe(COMPONENTS_V2_EPHEMERAL);
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
  });
});