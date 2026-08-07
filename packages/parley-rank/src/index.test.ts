import { describe, expect, test } from "bun:test";
import { formatElo, formatKd, formatWinRate, parleyRankForElo } from "./index.js";

describe("parleyRankForElo", () => {
  test("maps thresholds", () => {
    expect(parleyRankForElo(0).id).toBe("unspecified");
    expect(parleyRankForElo(1099).id).toBe("unspecified");
    expect(parleyRankForElo(1100).id).toBe("iron");
    expect(parleyRankForElo(4900).id).toBe("challenger");
  });

  test("uses Unranked label (shared web+worker)", () => {
    expect(parleyRankForElo(0).label).toBe("Unranked");
  });
});

describe("format helpers", () => {
  test("formatElo", () => {
    expect(formatElo(1234.6)).toBe("1,235");
  });
  test("formatWinRate", () => {
    expect(formatWinRate(3, 1)).toBe("75.0%");
    expect(formatWinRate(0, 0)).toBe("—");
  });
  test("formatKd", () => {
    expect(formatKd(10, 5)).toBe("2.00");
    expect(formatKd(4, 0)).toBe("4.00");
  });
});
