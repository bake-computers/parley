import { describe, expect, test } from "bun:test";
import { Game } from "@parley/proto";
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
  test("page 0 includes channel selects and page nav", () => {
    const card = buildNotificationSettingsCard(SETTINGS, {} as never, [], { page: 0 }).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("settings/match-results/");
    expect(text).toContain("settings/page/");
    expect(text).toContain("\"type\":3");
  });

  test("page 1 includes toggle buttons", () => {
    const card = buildNotificationSettingsCard(SETTINGS, {} as never, [], { page: 1 }).toJSON();
    const text = JSON.stringify(card);
    expect(text).toContain("settings/toggle/");
    expect(text).toContain("\"type\":2");
  });

  test("error card uses error accent", () => {
    const card = buildSettingsErrorCard("fail", {} as never).toJSON();
    expect(card["accent_color"]).toBe(0xef4444);
  });
});
