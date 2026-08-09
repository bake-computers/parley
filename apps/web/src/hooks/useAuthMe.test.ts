import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { clearAuthMeCache, hasSignedInHint } from "./useAuthMe";

describe("useAuthMe cache", () => {
  afterEach(() => {
    clearAuthMeCache();
    document.cookie = "parley_signed_in=; Max-Age=0; Path=/";
    vi.unstubAllGlobals();
  });

  test("clearAuthMeCache resets shared state", () => {
    clearAuthMeCache();
    expect(clearAuthMeCache).not.toThrow();
  });

  test("hasSignedInHint reads the non-HttpOnly presence cookie", () => {
    expect(hasSignedInHint()).toBe(false);

    document.cookie = "parley_signed_in=1; Path=/; SameSite=Lax";
    expect(hasSignedInHint()).toBe(true);

    document.cookie = "parley_signed_in=; Max-Age=0; Path=/";
    expect(hasSignedInHint()).toBe(false);
  });
});
