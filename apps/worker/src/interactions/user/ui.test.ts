import { describe, expect, test } from "bun:test";
import {
  buildSettingsCard,
  buildErrorCard,
  buildDeleteResultCard,
  buildInfoCard,
  buildRefreshErrorCard,
} from "#/interactions/user/ui";

const SETTINGS = {
  discordUserId: "u1",
  matchmakingEnabled: true,
  termsAcceptedAtMs: Date.now(),
  profilePublic: true,
  matchmakingRegion: 1,
} as never;

describe("user/ui — settings card", () => {
  test("renders the setting rows", () => {
    const card = buildSettingsCard(SETTINGS, {} as never).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("Matchmaking");
    expect(text).toContain("Visibility");
    expect(text).toContain("Matchmaking region");
  });

  test("has no footer text", () => {
    const card = buildSettingsCard(SETTINGS, {} as never).toJSON();
    const text = JSON.stringify(card);
    expect(text).not.toContain("-# Parley");
    expect(text).not.toContain("— Parley");
  });

  test("uses the graphite main accent", () => {
    const card = buildSettingsCard(SETTINGS, {} as never).toJSON();
    expect(card["accent_color"]).toBe(0x8a8a8e);
  });

  test("includes page navigation and choice buttons in JSON", () => {
    const card = buildSettingsCard(SETTINGS, {} as never).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("user/page/");
    expect(text).toContain("user/matchmaking/");
    expect(text).toContain('"type":2');
  });

  test("stays within the Discord Components v2 limit of 40 total components", () => {
    function countComponents(node: unknown): number {
      if (!node || typeof node !== "object") {
        return 0;
      }
      const record = node as {
        components?: unknown[];
        accessory?: unknown;
      };
      let total = 1;
      if (Array.isArray(record.components)) {
        for (const child of record.components) {
          total += countComponents(child);
        }
      }
      if (record.accessory) {
        total += countComponents(record.accessory);
      }
      return total;
    }

    const card = buildSettingsCard(SETTINGS, {} as never).toJSON();
    expect(countComponents(card)).toBeLessThanOrEqual(40);
  });
});

describe("user/ui — result cards", () => {
  test("error card uses the error color", () => {
    const card = buildErrorCard("oops", {} as never).toJSON();
    expect(card["accent_color"]).toBe(0xef4444);
    expect(JSON.stringify(card)).toContain("oops");
  });

  test("info card uses the main color", () => {
    const card = buildInfoCard("hello").toJSON();
    expect(card["accent_color"]).toBe(0x8a8a8e);
  });

  test("delete result card shows cooldown_until_ms as a Discord timestamp", () => {
    const card = buildDeleteResultCard(
      {
        anonymizedDiscordUserId: "anon",
        cooldownUntilMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
        tablesAffected: {
          players: 1,
          discordIdentities: 1,
        } as never,
      },
      {} as never,
    ).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("<t:");
    expect(text).toContain("anon");
  });

  test("refresh error card uses the warning color", () => {
    const card = buildRefreshErrorCard("timeout", {} as never).toJSON();
    expect(card["accent_color"]).toBe(0xf59e0b);
    expect(JSON.stringify(card)).toContain("timeout");
  });
});
