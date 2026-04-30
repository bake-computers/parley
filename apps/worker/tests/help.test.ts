import { describe, expect, test } from "bun:test";
import {
  HELP_PAGES,
  buildRenderedHelpPages,
  renderSlashCommandMention,
} from "../src/interactions/help";

describe("help mentions", () => {
  test("builds slash-command mentions from cached command IDs", () => {
    expect(
      renderSlashCommandMention("team create", {
        team: "1497745854604247196",
      }),
    ).toBe("</team create:1497745854604247196>");
  });

  test("falls back to inline code when the command ID is missing", () => {
    expect(renderSlashCommandMention("tournament view", {})).toBe("`/tournament view`");
  });

  test("help pages render at most five commands each", () => {
    const pages = buildRenderedHelpPages({
      account: "1",
      stats: "2",
      team: "3",
      queue: "4",
      ping: "5",
      tournament: "6",
      limit: "7",
      help: "8",
    });

    expect(pages).toHaveLength(HELP_PAGES.length);
    for (const page of pages) {
      expect(page.commands.length).toBeLessThanOrEqual(5);
    }
  });

  test("help pages include the slash command description under each command", () => {
    const pages = buildRenderedHelpPages({
      account: "1",
      stats: "2",
      team: "3",
      queue: "4",
      ping: "5",
      tournament: "6",
      limit: "7",
      help: "8",
    });

    expect(pages[0]?.commands[0]?.description).toBe("Register your R6 account for this server");
    expect(pages[1]?.commands[4]?.description).toBe("Check bot latency");
  });
});
