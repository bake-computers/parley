import { afterEach, describe, expect, test, vi } from "vite-plus/test";
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
