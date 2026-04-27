import { describe, expect, test } from "bun:test";
import { scrapeHtmlStatsCollection, scrapeHtmlStatsResult } from "../../src/lib/http";

function buildTestHtml(): string {
  const payload = [
    {
      username: "Player",
      level: 150,
      ranked_season_records: {
        "deep-freeze": {
          rank: "gold",
          max_rank: "platinum",
          rank_points: 3200,
          max_rank_points: 3500,
        },
        "new-blood": {
          rank: "emerald",
          max_rank: "diamond",
          rank_points: 4100,
          max_rank_points: 4500,
        },
      },
      season_mode_records: {
        "deep-freeze": {
          "ranked-bomb": {
            matches: 20,
            wins: 12,
            losses: 8,
            abandons: 0,
            kills: 120,
            deaths: 90,
            assists: 40,
            headshots: 50,
            kd: 1.3333,
            hs: 41.66,
            wr: 60,
          },
        },
        "new-blood": {
          "ranked-bomb": {
            matches: 12,
            wins: 8,
            losses: 4,
            abandons: 0,
            kills: 90,
            deaths: 70,
            assists: 20,
            headshots: 30,
            kd: 1.2857,
            hs: 33.33,
            wr: 66.66,
          },
        },
      },
    },
    {
      rank_tiers: {
        ii: { display: "II" },
        iii: { display: "III" },
        iv: { display: "IV" },
      },
      ranks: {
        gold: { display: "Gold", tier: "iii" },
        platinum: { display: "Platinum", tier: "ii" },
        emerald: { display: "Emerald", tier: "iv" },
        diamond: { display: "Diamond", tier: "ii" },
      },
      seasons: {
        "deep-freeze": {
          display: "Deep Freeze",
          started_at: "2024-12-01T00:00:00.000Z",
        },
        "new-blood": {
          display: "New Blood",
          started_at: "2025-06-01T00:00:00.000Z",
        },
      },
    },
    {
      '{"matches":{"playlist":"ranked"}}': [
        {
          pages: [
            [
              {
                started_at: "2025-06-12T00:00:00.000Z",
                player_summary: {
                  rounds: 5,
                  round_survivals: 2,
                  trades: 1,
                  opening_kills: 1,
                  kills: 4,
                  kills_2k: 1,
                  kills_3k: 0,
                  kills_4k: 0,
                  kills_5k: 0,
                },
              },
            ],
          ],
        },
      ],
    },
  ];

  return `<html><body><script id="__NUXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></body></html>`;
}

describe("stats season parsing", () => {
  test("selects latest season when no season is provided", () => {
    const result = scrapeHtmlStatsResult(buildTestHtml());

    expect(result.isOk()).toBe(true);
    expect(result.isOk() ? result.value.ranked_stats.season : "").toBe("new-blood");
  });

  test("matches exact slug", () => {
    const result = scrapeHtmlStatsResult(buildTestHtml(), "deep-freeze");

    expect(result.isOk()).toBe(true);
    expect(result.isOk() ? result.value.ranked_stats.season : "").toBe("deep-freeze");
  });

  test("matches exact display name", () => {
    const result = scrapeHtmlStatsResult(buildTestHtml(), "Deep Freeze");

    expect(result.isOk()).toBe(true);
    expect(result.isOk() ? result.value.ranked_stats.season : "").toBe("deep-freeze");
  });

  test("matches normalized space and hyphen variants", () => {
    const withSpaces = scrapeHtmlStatsResult(buildTestHtml(), "deep freeze");
    const withHyphen = scrapeHtmlStatsResult(buildTestHtml(), "Deep-Freeze");

    expect(withSpaces.isOk()).toBe(true);
    expect(withHyphen.isOk()).toBe(true);
    expect(withSpaces.isOk() ? withSpaces.value.ranked_stats.season : "").toBe("deep-freeze");
    expect(withHyphen.isOk() ? withHyphen.value.ranked_stats.season : "").toBe("deep-freeze");
  });

  test("returns season-not-found with available seasons", () => {
    const result = scrapeHtmlStatsResult(buildTestHtml(), "bad-season");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe("season-not-found");
      expect(result.error.availableSeasons?.map((entry) => entry.slug)).toEqual([
        "new-blood",
        "deep-freeze",
      ]);
    }
  });

  test("season catalog is sorted newest-first", () => {
    const collection = scrapeHtmlStatsCollection(buildTestHtml());
    expect(collection.seasonCatalog.map((entry) => entry.slug)).toEqual([
      "new-blood",
      "deep-freeze",
    ]);
  });
});
