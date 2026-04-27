import { describe, expect, test } from "bun:test";
import { mergeTeamResults, parsePlayerResultInput } from "../../src/team/results";

describe("team results", () => {
  test("parses kills and deaths", () => {
    expect(parsePlayerResultInput("8/6")).toEqual({ kills: 8, deaths: 6 });
  });

  test("rejects invalid result input", () => {
    expect(() => parsePlayerResultInput("8-6")).toThrow();
  });

  test("merges team result maps", () => {
    const merged = mergeTeamResults(
      new Map([["user-1", { kills: 8, deaths: 6 }]]),
      new Map([["user-2", { kills: 7, deaths: 5 }]]),
    );

    expect(merged.size).toBe(2);
    expect(merged.get("user-2")).toEqual({ kills: 7, deaths: 5 });
  });
});
