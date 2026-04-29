import { describe, expect, test } from "bun:test";
import {
  buildStandardSeedPlacementOrder,
  seedTournamentEntries,
} from "../../src/tournament/seeding";

describe("tournament seeding", () => {
  test("buildStandardSeedPlacementOrder returns standard bracket placement", () => {
    expect(buildStandardSeedPlacementOrder(4)).toEqual([1, 4, 2, 3]);
    expect(buildStandardSeedPlacementOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  test("seedTournamentEntries sorts by average, total, joined time, then id", () => {
    const seeded = seedTournamentEntries([
      { id: 4, joinedAt: 20, stackBalanceAverage: 1010, stackBalanceTotal: 5050 },
      { id: 2, joinedAt: 10, stackBalanceAverage: 1010, stackBalanceTotal: 5050 },
      { id: 3, joinedAt: 5, stackBalanceAverage: 1010, stackBalanceTotal: 5040 },
      { id: 1, joinedAt: 1, stackBalanceAverage: 1030, stackBalanceTotal: 5150 },
    ]);

    expect(seeded.map((entry) => entry.id)).toEqual([1, 2, 4, 3]);
    expect(seeded.map((entry) => entry.seedNumber)).toEqual([1, 2, 3, 4]);
  });
});
