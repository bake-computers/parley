import { describe, expect, test } from "bun:test";
import { parseKDA, formatKDA } from "#/interactions/team/helpers";
import type { MatchParticipant } from "@parley/proto/matchmaking/v1/matchmaking_pb.js";

describe("parseKDA", () => {
  test("empty input is all zeros", () => {
    expect(parseKDA("")).toEqual({ kills: 0, deaths: 0, assists: 0 });
    expect(parseKDA("   ")).toEqual({ kills: 0, deaths: 0, assists: 0 });
  });

  test("parses three space-separated numbers", () => {
    expect(parseKDA("4 5 2")).toEqual({ kills: 4, deaths: 5, assists: 2 });
    expect(parseKDA(" 12  0  8 ")).toEqual({ kills: 12, deaths: 0, assists: 8 });
  });

  test("rejects wrong counts", () => {
    expect(typeof parseKDA("4 5")).toBe("string");
    expect(typeof parseKDA("4 5 2 1")).toBe("string");
  });

  test("rejects negatives and non-integers", () => {
    expect(typeof parseKDA("-1 0 0")).toBe("string");
    expect(typeof parseKDA("1.5 0 0")).toBe("string");
    expect(typeof parseKDA("a b c")).toBe("string");
  });
});

describe("formatKDA", () => {
  test("missing stats render as zeros", () => {
    const p = { discordUserId: "u1", team: "a" } as MatchParticipant;
    expect(formatKDA(p)).toBe("0/0/0");
  });

  test("present stats render verbatim", () => {
    const p = { kills: 4, deaths: 5, assists: 2 } as MatchParticipant;
    expect(formatKDA(p)).toBe("4/5/2");
  });
});
