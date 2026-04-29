import { describe, expect, test } from "bun:test";
import { buildTournamentBracket } from "../../src/tournament/bracket";

describe("tournament bracket generation", () => {
  for (const [teamCount, expectedMatches] of [
    [4, 3],
    [8, 7],
    [16, 15],
    [32, 31],
  ] as const) {
    test(`builds single elimination bracket for ${teamCount} teams`, () => {
      const bracket = buildTournamentBracket("single", teamCount);

      expect(bracket).toHaveLength(expectedMatches);
      expect(bracket.filter((match) => match.roundNumber === 1)).toHaveLength(teamCount / 2);
      expect(bracket.filter((match) => match.status === "ready")).toHaveLength(teamCount / 2);
    });
  }

  for (const [teamCount, expectedMatches] of [
    [4, 6],
    [8, 14],
    [16, 30],
    [32, 62],
  ] as const) {
    test(`builds double elimination bracket for ${teamCount} teams`, () => {
      const bracket = buildTournamentBracket("double", teamCount);

      expect(bracket).toHaveLength(expectedMatches);
      expect(bracket.some((match) => match.bracket === "grand_final")).toBe(true);
      expect(
        bracket.filter((match) => match.bracket === "upper" && match.roundNumber === 1),
      ).toHaveLength(teamCount / 2);
      expect(
        bracket
          .filter((match) => match.bracket === "upper" && match.roundNumber === 1)
          .every((match) => match.loserToKey !== null),
      ).toBe(true);
    });
  }

  test("double elimination grand final has no reset match", () => {
    const bracket = buildTournamentBracket("double", 8);
    const grandFinals = bracket.filter((match) => match.bracket === "grand_final");

    expect(grandFinals).toHaveLength(1);
    expect(grandFinals[0]?.winnerToKey).toBeNull();
  });
});
