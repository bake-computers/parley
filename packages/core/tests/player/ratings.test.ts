import { describe, expect, test } from "bun:test";
import { isExternalStatsRefreshLocked } from "../../src/player/ratings";

describe("player ratings", () => {
  test("locks external refreshes after ten internal matches", () => {
    expect(
      isExternalStatsRefreshLocked({
        playerId: 1,
        username: "Player",
        platform: "pc",
        internalElo: 1100,
        internalMatches: 10,
        internalWins: 6,
        internalLosses: 4,
        internalUpdatedAt: null,
      }),
    ).toBe(true);
  });

  test("keeps external refreshes available below ten matches", () => {
    expect(
      isExternalStatsRefreshLocked({
        playerId: 1,
        username: "Player",
        platform: "pc",
        internalElo: 1100,
        internalMatches: 9,
        internalWins: 5,
        internalLosses: 4,
        internalUpdatedAt: null,
      }),
    ).toBe(false);
  });
});
