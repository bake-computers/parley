import { describe, expect, test } from "bun:test";
import {
  buildStatsMessagePayload,
  buildStatsPaginationCustomId,
  buildStatsPaginationRow,
  parseStatsPaginationCustomId,
} from "./stats-embeds";
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

describe("stats embeds pagination", () => {
  test("stats pagination custom IDs roundtrip", () => {
    const customId = buildStatsPaginationCustomId("interaction-1", 2);
    expect(customId).toBe("stats-page/interaction-1?page=2");
    expect(parseStatsPaginationCustomId(customId)).toEqual({
      viewId: "interaction-1",
      page: 2,
    });
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

  test("message payload includes paged embed and components", () => {
    const payload = buildStatsMessagePayload(envelopeFixture(), "cache", false, "interaction-1", 1);
    const embed = payload.embeds[0].toJSON();
    const row = payload.components[0].toJSON();

    expect(embed.description).toContain("Section: Combat");
    expect(row.components).toHaveLength(5);
  });
});
