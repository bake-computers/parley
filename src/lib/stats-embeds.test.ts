import { describe, expect, test } from "bun:test";
import {
  buildStatsMessagePayload,
  buildStatsPaginationCustomId,
  buildStatsPaginationRow,
  parseStatsPaginationCustomId,
} from "./stats-embeds";
import type { ApplicationEmojiCatalog } from "./discord";
import type { StatsCacheEnvelope } from "./stats-cache";

function envelopeFixture(): StatsCacheEnvelope {
  return {
    version: 1,
    cachedAt: Date.parse("2026-04-25T18:00:00.000Z"),
    username: "Player",
    profile: {
      username: "Player",
      platform: "pc",
      level: 120,
      profile_url: "https://stats.cc/siege/Player/uuid-player",
    },
    rankedStats: {
      season: "new-blood",
      season_display: "New Blood",
      current_rank: "Gold",
      current_rank_tier: "III",
      rank_points: 3200,
      matches: 20,
      wins: 12,
      losses: 8,
      win_rate: 60,
      kills: 100,
      deaths: 80,
      assists: 20,
      kd_ratio: 1.25,
      headshots: 35,
      headshot_percentage: 35,
      rounds_played: 50,
      kill_rounds: 20,
      survival_rounds: 10,
      traded_rounds: 5,
    },
    calculatedMetrics: {
      kost_lower_bound: 45,
      kost_upper_bound: 60,
    },
  };
}

function emojiCatalogFixture(): ApplicationEmojiCatalog {
  return {
    home: { id: "1", name: "home", animated: false },
    minus: { id: "2", name: "minus", animated: false },
    plus: { id: "3", name: "plus", animated: false },
    search: { id: "4", name: "search", animated: false },
  };
}

describe("stats embeds pagination", () => {
  test("stats pagination custom IDs roundtrip", () => {
    const customId = buildStatsPaginationCustomId("interaction-1", 2);
    expect(customId).toBe("stats-page/interaction-1?page=2");
    expect(parseStatsPaginationCustomId(customId)).toEqual({
      viewId: "interaction-1",
      page: 2,
    });
  });

  test("pagination row custom IDs stay unique within a single action row", () => {
    const row = buildStatsPaginationRow("interaction-1", 0).toJSON();
    const buttons = row.components as Record<string, unknown>[];
    const customIds = buttons.map((button) => String(button.custom_id));

    expect(new Set(customIds).size).toBe(customIds.length);
  });

  test("pagination row disables boundary buttons", () => {
    const firstPage = buildStatsPaginationRow("interaction-1", 0).toJSON();
    const firstButtons = firstPage.components as Record<string, unknown>[];
    expect(firstButtons[0]?.disabled).toBe(true);
    expect(firstButtons[1]?.disabled).toBe(true);
    expect(firstButtons[3]?.disabled).toBe(false);
    expect(firstButtons[4]?.disabled).toBe(false);

    const lastPage = buildStatsPaginationRow("interaction-1", 2).toJSON();
    const lastButtons = lastPage.components as Record<string, unknown>[];
    expect(lastButtons[0]?.disabled).toBe(false);
    expect(lastButtons[1]?.disabled).toBe(false);
    expect(lastButtons[3]?.disabled).toBe(true);
    expect(lastButtons[4]?.disabled).toBe(true);
  });

  test("stats titles and buttons include emojis when provided", () => {
    const payload = buildStatsMessagePayload(
      envelopeFixture(),
      "cache",
      false,
      "interaction-1",
      0,
      emojiCatalogFixture(),
    );
    const embed = payload.embeds[0].toJSON();
    const row = payload.components[0].toJSON();
    const buttons = row.components as Record<string, unknown>[];

    expect(embed.title).toBe("<:search:4> Siege Stats: Player");
    expect(buttons[0]?.emoji).toEqual({ id: "1", name: "home", animated: false });
    expect(buttons[1]?.emoji).toEqual({ id: "2", name: "minus", animated: false });
    expect(buttons[3]?.emoji).toEqual({ id: "3", name: "plus", animated: false });
    expect(buttons[2]?.emoji).toBeUndefined();
    expect(buttons[4]?.emoji).toBeUndefined();
  });

  test("message payload includes paged embed and components", () => {
    const payload = buildStatsMessagePayload(envelopeFixture(), "cache", false, "interaction-1", 1);
    const embed = payload.embeds[0].toJSON();
    const row = payload.components[0].toJSON();

    expect(embed.description).toContain("Section: Combat");
    expect(row.components).toHaveLength(5);
  });

  test("builders keep valid payloads when emojis are missing", () => {
    const payload = buildStatsMessagePayload(
      envelopeFixture(),
      "cache",
      false,
      "interaction-1",
      0,
      {},
    );
    const embed = payload.embeds[0].toJSON();
    const row = payload.components[0].toJSON();
    const buttons = row.components as Record<string, unknown>[];

    expect(embed.title).toBe("Siege Stats: Player");
    expect(buttons[0]?.emoji).toBeUndefined();
    expect(buttons[1]?.emoji).toBeUndefined();
    expect(buttons[3]?.emoji).toBeUndefined();
  });
});
