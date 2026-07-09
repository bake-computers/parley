import { describe, expect, test } from "bun:test";
import { formatParleyRankLine, parleyRankForElo, parseCooldownUntilMs } from "#/ui/parley-rank.js";

describe("parleyRankForElo", () => {
  test("maps boundary elo values to expected tiers", () => {
    expect(parleyRankForElo(0).id).toBe("unspecified");
    expect(parleyRankForElo(999).id).toBe("unspecified");
    expect(parleyRankForElo(1000).id).toBe("iron");
    expect(parleyRankForElo(2563).id).toBe("gold");
    expect(parleyRankForElo(4900).id).toBe("challenger");
  });
});

describe("formatParleyRankLine", () => {
  test("falls back to text when emoji is missing from catalog", () => {
    expect(formatParleyRankLine({}, 2563)).toBe("**Gold** · 2,563");
  });
});

describe("parseCooldownUntilMs", () => {
  test("extracts epoch ms from engine cooldown errors", () => {
    expect(parseCooldownUntilMs("re-link cooldown active until 1710000000000 ms since epoch")).toBe(
      1710000000000,
    );
    expect(parseCooldownUntilMs("account already linked")).toBeNull();
  });
});
