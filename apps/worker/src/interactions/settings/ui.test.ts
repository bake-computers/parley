import { describe, expect, test } from "bun:test";
import { Game } from "@parley/proto";
import { SETTINGS_CHANNEL_NONE } from "./constants.js";
import { buildNotificationSettingsCard, buildSettingsErrorCard } from "./ui.js";

const SETTINGS = {
  guildId: "g1",
  game: Game.R6,
  matchResultsChannel: "111",
  tournamentAnnouncementsChannel: "",
  leaderboardUpdatesEnabled: true,
  updatedAtMs: 0n,
  crossGuildAnnouncementsEnabled: false,
  announceMatchReadyEnabled: true,
  announceMatchResultsEnabled: false,
} as never;

describe("settings/ui — notification card", () => {
  test("page 0 includes channel selects in action rows and page nav", () => {
    const card = buildNotificationSettingsCard(SETTINGS, {} as never, [], { page: 0 }).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("settings/match-results/");
    expect(text).toContain("settings/page/");
    expect(text).toContain('"type":1');
    expect(text).toContain('"type":3');
    expect(text).not.toContain('"accessory":{"type":3');
    expect(text).toContain(SETTINGS_CHANNEL_NONE);
    expect(text).not.toContain('"value":""');
  });

  test("page 1 includes toggle buttons", () => {
    const card = buildNotificationSettingsCard(SETTINGS, {} as never, [], { page: 1 }).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("settings/toggle/");
    expect(text).toContain('"type":2');
  });

  test("error card uses error accent", () => {
    const card = buildSettingsErrorCard("fail", {} as never).toJSON();
    expect(card["accent_color"]).toBe(0xef4444);
  });

  test("each page stays within the Discord Components v2 limit of 40 total components", () => {
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

    for (const page of [0, 1]) {
      const card = buildNotificationSettingsCard(SETTINGS, {} as never, [], { page }).toJSON();
      expect(countComponents(card)).toBeLessThanOrEqual(40);
    }
  });
});
