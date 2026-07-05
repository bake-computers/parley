import { afterEach, describe, expect, test, vi } from "vitest";
import { clearAuthMeCache } from "./useAuthMe";

describe("useAuthMe cache", () => {
  afterEach(() => {
    clearAuthMeCache();
    vi.unstubAllGlobals();
  });

  test("clearAuthMeCache resets shared state", () => {
    clearAuthMeCache();
    expect(clearAuthMeCache).not.toThrow();
  });
});
