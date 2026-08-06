import { describe, expect, test } from "vite-plus/test";
import { normalizeUserSettings } from "./handlers";

describe("normalizeUserSettings", () => {
  test("applies defaults for missing toggles", () => {
    const normalized = normalizeUserSettings({
      discordUserId: "123",
    } as never);
    expect(normalized.matchmakingEnabled).toBe(true);
    expect(normalized.profilePublic).toBe(true);
    expect(normalized.updatedAtMs).toBe(0);
  });

  test("keeps explicit values", () => {
    const normalized = normalizeUserSettings({
      discordUserId: "123",
      updatedAtMs: 42,
      matchmakingEnabled: false,
      profilePublic: false,
    });
    expect(normalized.matchmakingEnabled).toBe(false);
    expect(normalized.profilePublic).toBe(false);
    expect(normalized.updatedAtMs).toBe(42);
  });
});
