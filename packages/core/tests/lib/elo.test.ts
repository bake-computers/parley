import { describe, expect, test } from "bun:test";
import {
  calculateExpectedScore,
  calculateTeamEloDelta,
  roundInternalElo,
  seedScoreToInternalElo,
} from "../../src/lib/elo";

describe("internal elo", () => {
  test("maps seed score into provisional internal elo", () => {
    expect(seedScoreToInternalElo(218.65)).toBe(1237);
  });

  test("calculates expected score for evenly matched teams", () => {
    expect(calculateExpectedScore(1200, 1200)).toBe(0.5);
  });

  test("calculates a positive team delta for the winner", () => {
    expect(calculateTeamEloDelta({ teamARating: 1200, teamBRating: 1200, winner: "A" })).toBe(16);
  });

  test("winner and loser deltas move in opposite directions", () => {
    const winnerDelta = calculateTeamEloDelta({
      teamARating: 1200,
      teamBRating: 1250,
      winner: "A",
    });
    const loserDelta = calculateTeamEloDelta({
      teamARating: 1200,
      teamBRating: 1250,
      winner: "B",
    });

    expect(winnerDelta).toBeGreaterThan(0);
    expect(loserDelta).toBeLessThan(0);
  });

  test("rounds internal elo values to whole numbers", () => {
    expect(roundInternalElo(1012.6)).toBe(1013);
  });
});
