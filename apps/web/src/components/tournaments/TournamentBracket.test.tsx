import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vite-plus/test";
import type { BracketMatchJson } from "#/lib/tournament/rpc";
import {
  bracketLabel,
  buildPlaceholderBracket,
  groupBracket,
  TournamentBracket,
} from "./TournamentBracket";

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

describe("buildPlaceholderBracket", () => {
  test("single elim builds a full winners tree sized to the next power of two", () => {
    const matches = buildPlaceholderBracket({ teamCount: 8, format: "5v5_single_elimination" });
    expect(matches).toHaveLength(7);
    const groups = groupBracket(matches);
    expect(groups.map((g) => g.bracket)).toEqual(["winners"]);
    const [winners] = groups;
    expect(winners?.rounds.map((r) => [r.roundNumber, r.matches.length])).toEqual([
      [1, 4],
      [2, 2],
      [3, 1],
    ]);
    for (const m of matches) {
      expect(m.status).toBe("pending");
      expect(m.teamAId).toBeUndefined();
      expect(m.teamBId).toBeUndefined();
      expect(m.id).toBeLessThan(0);
    }
    expect(new Set(matches.map((m) => m.id)).size).toBe(matches.length);
  });

  test("double elim adds a losers section and grand final", () => {
    const matches = buildPlaceholderBracket({ teamCount: 8, format: "5v5_double_elimination" });
    expect(matches).toHaveLength(11);
    const groups = groupBracket(matches);
    expect(groups.map((g) => g.bracket)).toEqual(["winners", "losers", "grand_final"]);
    const losers = groups.find((g) => g.bracket === "losers");
    expect(losers?.rounds.map((r) => [r.roundNumber, r.matches.length])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    const grandFinal = groups.find((g) => g.bracket === "grand_final");
    expect(grandFinal?.rounds).toHaveLength(1);
    expect(grandFinal?.rounds[0]?.matches).toHaveLength(1);
  });

  test("small fields floor the bracket size at 2", () => {
    expect(buildPlaceholderBracket({ teamCount: 1, format: "1v1_single_elimination" })).toHaveLength(
      1,
    );
    const double = buildPlaceholderBracket({ teamCount: 2, format: "5v5_double_elimination" });
    // 1 winners match + 1 losers round 1 + 1 losers round 2 + 1 grand final.
    expect(double).toHaveLength(4);
  });

  test("sizes to the registered team count, not the cap (3 teams → 4-slot tree)", () => {
    const matches = buildPlaceholderBracket({ teamCount: 3, format: "5v5_single_elimination" });
    expect(matches).toHaveLength(3);
    const [winners] = groupBracket(matches);
    expect(winners?.rounds.map((r) => [r.roundNumber, r.matches.length])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });
});

describe("TournamentBracket rendering", () => {
  test("empty slots render as N/A", () => {
    const matches = buildPlaceholderBracket({ teamCount: 4, format: "5v5_single_elimination" });
    render(<TournamentBracket matches={matches} teams={[]} />);
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });

  test("seeded teams render with a seed prefix", () => {
    const matches = [
      match({ id: 1, teamAId: 10, teamBId: undefined }),
      match({ id: 2, teamAId: 11, teamBId: undefined }),
      match({ id: 3, roundNumber: 2, teamAId: undefined, teamBId: undefined }),
    ];
    render(
      <TournamentBracket
        matches={matches}
        teams={[
          { id: 10, teamName: "Wolves", seedNumber: 1 },
          { id: 11, teamName: "Foxes", seedNumber: 2 },
        ]}
      />,
    );
    expect(screen.getByText("Wolves").textContent).toBe("#1Wolves");
    expect(screen.getByText("Foxes").textContent).toBe("#2Foxes");
  });
});
