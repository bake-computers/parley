import { describe, expect, test } from "bun:test";
import {
  checkConnectionRateLimit,
  isOriginAllowed,
  parseAllowedOrigins,
  resetConnectionRateLimits,
} from "#/security";

describe("security", () => {
  test("parseAllowedOrigins splits and trims", () => {
    expect(parseAllowedOrigins("https://parley.bot, http://localhost:3000")).toEqual([
      "https://parley.bot",
      "http://localhost:3000",
    ]);
  });

  test("isOriginAllowed matches allowlist", () => {
    const allowed = ["https://parley.bot"];
    expect(isOriginAllowed("https://parley.bot", allowed)).toBe(true);
    expect(isOriginAllowed("https://evil.example", allowed)).toBe(false);
  });

  test("checkConnectionRateLimit enforces sliding window", () => {
    resetConnectionRateLimits();
    const ip = "203.0.113.10";
    const now = 1_700_000_000_000;
    for (let i = 0; i < 10; i += 1) {
      expect(checkConnectionRateLimit(ip, 10, now + i)).toBe(true);
    }
    expect(checkConnectionRateLimit(ip, 10, now + 10)).toBe(false);
    expect(checkConnectionRateLimit(ip, 10, now + 60_001)).toBe(true);
  });
});
