import { describe, expect, test } from "bun:test";
import { formatParleyRankLine } from "#/utils/parley-rank";

describe("formatParleyRankLine", () => {
  test("renders the configured Discord emoji markup without resolving a catalog", () => {
    expect(formatParleyRankLine(2500)).toBe("<:gold:1517287554691371018> **Gold** · 2,500");
  });
});
