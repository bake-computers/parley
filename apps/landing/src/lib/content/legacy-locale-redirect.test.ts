import { describe, expect, test } from "vitest";
import { canonicalPathFromLegacyLocale } from "./legacy-locale-redirect.js";

describe("canonicalPathFromLegacyLocale", () => {
  test("maps /en to /", () => {
    expect(canonicalPathFromLegacyLocale("/en")).toBe("/");
  });

  test("maps /de/leaderboard to /leaderboard", () => {
    expect(canonicalPathFromLegacyLocale("/de/leaderboard")).toBe("/leaderboard");
  });

  test("returns null for non-legacy paths", () => {
    expect(canonicalPathFromLegacyLocale("/leaderboard")).toBeNull();
    expect(canonicalPathFromLegacyLocale("/dashboard")).toBeNull();
  });
});