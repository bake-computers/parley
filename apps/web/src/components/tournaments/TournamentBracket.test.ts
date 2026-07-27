import { describe, expect, test } from "vitest";
import type { BracketMatchJson } from "#/lib/tournament/rpc";
import { bracketLabel, groupBracket } from "./TournamentBracket";

function match(partial: Partial<BracketMatchJson> & { id: number }): BracketMatchJson {
  return {
    bracket: "winners",
    roundNumber: 1,
    matchNumber: 1,
    status: "pending",
    ...partial,
  };
}

describe("groupBracket", () => {
  test("groups by bracket with winners first, losers second, grand final last", () => {
    const groups = groupBracket([
      match({ id: 3, bracket: "grand_final" }),
      match({ id: 2, bracket: "losers" }),
      match({ id: 1, bracket: "winners" }),
    ]);
    expect(groups.map((g) => g.bracket)).toEqual(["winners", "losers", "grand_final"]);
  });

  test("sorts rounds and matches within each bracket", () => {
    const groups = groupBracket([
      match({ id: 4, roundNumber: 2, matchNumber: 1 }),
      match({ id: 3, roundNumber: 1, matchNumber: 2 }),
      match({ id: 2, roundNumber: 2, matchNumber: 2 }),
      match({ id: 1, roundNumber: 1, matchNumber: 1 }),
    ]);
    expect(groups).toHaveLength(1);
    const [winners] = groups;
    expect(winners?.rounds.map((r) => r.roundNumber)).toEqual([1, 2]);
    expect(winners?.rounds[0]?.matches.map((m) => m.id)).toEqual([1, 3]);
    expect(winners?.rounds[1]?.matches.map((m) => m.id)).toEqual([4, 2]);
  });

  test("empty bracket yields no groups", () => {
    expect(groupBracket([])).toEqual([]);
  });
});

describe("bracketLabel", () => {
  test("labels known brackets and falls back to the raw value", () => {
    expect(bracketLabel("winners")).toBe("Winners bracket");
    expect(bracketLabel("losers")).toBe("Losers bracket");
    expect(bracketLabel("grand_final")).toBe("Grand final");
    expect(bracketLabel("custom")).toBe("custom");
  });
});
