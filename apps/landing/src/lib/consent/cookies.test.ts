import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  allowsPreferences,
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  hasConsent,
  readConsent,
  THEME_STORAGE_KEY,
  writeConsent,
} from "./cookies.js";

function mockLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

beforeEach(() => {
  mockLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cookie consent", () => {
  test("writeConsent stores version and preferences flag", () => {
    const consent = writeConsent(true);
    expect(consent).toEqual({
      version: CONSENT_VERSION,
      essential: true,
      preferences: true,
      at: expect.any(Number),
    });
    expect(readConsent()).toEqual(consent);
    expect(hasConsent()).toBe(true);
    expect(allowsPreferences()).toBe(true);
  });

  test("essential only clears theme storage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    writeConsent(false);
    expect(allowsPreferences()).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  test("rejects stale consent version", () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: "v0", essential: true, preferences: true, at: 1 }),
    );
    expect(readConsent()).toBeNull();
    expect(hasConsent()).toBe(false);
  });
});