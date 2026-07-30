import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { turnstileEnabled, verifyTurnstileToken } from "./turnstile.js";

describe("turnstile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("turnstileEnabled requires both keys", () => {
    expect(turnstileEnabled("site", "secret")).toBe(true);
    expect(turnstileEnabled("site", undefined)).toBe(false);
    expect(turnstileEnabled(undefined, "secret")).toBe(false);
  });

  test("verifyTurnstileToken returns true on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ success: true })),
    );

    await expect(verifyTurnstileToken("secret", "token")).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("verifyTurnstileToken returns false on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ success: false })),
    );

    await expect(verifyTurnstileToken("secret", "bad")).resolves.toBe(false);
  });
});
