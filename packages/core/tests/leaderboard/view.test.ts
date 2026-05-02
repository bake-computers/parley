import { describe, expect, test } from "bun:test";
import {
  buildLeaderboardPaginationCustomId,
  clampLeaderboardPage,
  compareLeaderboardEntries,
  filterLeaderboardEntries,
  formatLeaderboardRow,
  leaderboardPageCount,
  leaderboardPageOffset,
  parseLeaderboardPaginationCustomId,
  type LeaderboardEntry,
} from "../../src/leaderboard/view";

const entries: LeaderboardEntry[] = [
  {
    playerId: 2,
    username: "Bravo",
    platform: "pc",
    internalElo: 1200,
    internalMatches: 6,
    internalWins: 4,
    internalLosses: 2,
    discordUserId: "user-2",
  },
  {
    playerId: 3,
    username: "Charlie",
    platform: "xbox",
    internalElo: 1200,
    internalMatches: 7,
    internalWins: 5,
    internalLosses: 2,
    discordUserId: null,
  },
  {
    playerId: 1,
    username: "Alpha",
    platform: "pc",
    internalElo: 1200,
    internalMatches: 7,
    internalWins: 3,
    internalLosses: 4,
    discordUserId: "user-1",
  },
  {
    playerId: 4,
    username: "Delta",
    platform: "playstation",
    internalElo: 1100,
    internalMatches: 0,
    internalWins: 0,
    internalLosses: 0,
    discordUserId: null,
  },
];

describe("leaderboard view", () => {
  test("computes page counts and clamps page indexes", () => {
    expect(leaderboardPageCount(0, 10)).toBe(1);
    expect(leaderboardPageCount(21, 10)).toBe(3);

    expect(clampLeaderboardPage(2, 21, 10)).toBe(2);
    expect(clampLeaderboardPage(99, 21, 10)).toBe(2);
    expect(clampLeaderboardPage(-2, 21, 10)).toBe(0);
  });

  test("computes offsets from clamped page indexes", () => {
    expect(leaderboardPageOffset(0, 21, 10)).toBe(0);
    expect(leaderboardPageOffset(2, 21, 10)).toBe(20);
    expect(leaderboardPageOffset(20, 21, 10)).toBe(20);
  });

  test("filters by platform and minimum matches", () => {
    const filteredPlatform = filterLeaderboardEntries(entries, {
      platform: "pc",
      minMatches: 1,
    });
    expect(filteredPlatform.map((entry) => entry.username)).toEqual(["Bravo", "Alpha"]);

    const filteredMatches = filterLeaderboardEntries(entries, {
      platform: "all",
      minMatches: 7,
    });
    expect(filteredMatches.map((entry) => entry.username)).toEqual(["Charlie", "Alpha"]);
  });

  test("sorts by ELO then matches then username then id", () => {
    const sorted = [...entries].sort(compareLeaderboardEntries);
    expect(sorted.map((entry) => entry.username)).toEqual(["Alpha", "Charlie", "Bravo", "Delta"]);
  });

  test("pagination custom ids roundtrip", () => {
    const customId = buildLeaderboardPaginationCustomId("interaction-1", 4);
    expect(customId).toBe("leaderboard-page/interaction-1?page=4");
    expect(parseLeaderboardPaginationCustomId(customId)).toEqual({
      viewId: "interaction-1",
      page: 4,
    });
  });

  test("formats leaderboard rows", () => {
    expect(formatLeaderboardRow(3, entries[0]!)).toBe("#3 <@user-2> — ELO 1200 • 4-2 (6)");
    expect(formatLeaderboardRow(1, entries[3]!)).toBe("#1 Delta — ELO 1100 • 0-0 (0)");
  });
});
