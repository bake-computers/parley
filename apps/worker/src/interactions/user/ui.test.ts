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
} as never;

const emoji = (name: string) => ({ id: `id-${name}`, name, discordName: name, animated: false });

// A populated catalog so the select options actually carry emojis through setEmoji.
const CATALOG = {
  pin: emoji("pin"),
  global: emoji("global"),
  linked: emoji("linked"),
  ban_hammer: emoji("ban_hammer"),
  ban_hammer_red: emoji("ban_hammer_red"),
  redirect: emoji("redirect"),
  reload: emoji("reload"),
  trash_red: emoji("trash_red"),
  calendar: emoji("calendar"),
  warning_orange: emoji("warning_orange"),
} as never;

function render(view?: { page?: number }) {
  return buildSettingsCard(SETTINGS, CATALOG, view).map((component) => component.toJSON());
}

function textOf(node: unknown): string {
  return JSON.stringify(node);
}

describe("user/ui — settings card (preferences)", () => {
  test("renders a # title and ## section headers with descriptions", () => {
    const [container] = render();
    const text = textOf(container);
    expect(text).toContain("## Matchmaking");
    expect(text).toContain("## Visibility");
    expect(text).toContain("Join the ranked queue, or pause it.");
    expect(text).toContain("Control who sees your profile and stats.");
  });

  test("uses string select menus with emoji options and the current value as default", () => {
    const [container] = render();
    const text = textOf(container);
    expect(text).toContain('"type":3');
    expect(text).toContain('"custom_id":"user/matchmaking"');
    expect(text).toContain('"custom_id":"user/visibility"');
    expect(text).toContain('"value":"on"');
    expect(text).toContain('"value":"off"');
    expect(text).toContain('"value":"public"');
    expect(text).toContain('"value":"hidden"');
    // emojis attached to options (proves setEmoji serializes through the builder)
    expect(text).toContain("id-linked");
    expect(text).toContain("id-ban_hammer");
    expect(text).toContain("id-global");
    expect(text).toContain("id-ban_hammer_red");
    expect(text).toContain('"default":true');
  });

  test("keeps navigation buttons in a separate top-level row, outside the container", () => {
    const [container, actions] = render();
    expect(textOf(container)).not.toContain("user/page/");
    expect(Array.isArray(actions["components"])).toBe(true);
    const actionsText = textOf(actions);
    expect(actionsText).toContain("user/page/");
    expect(actionsText).toContain("Back");
    expect(actionsText).toContain("Privacy");
  });

  test("uses the graphite main accent on the container", () => {
    const [container] = render();
    expect(container["accent_color"]).toBe(0x8a8a8e);
  });

  test("has no footer text", () => {
    const text = textOf(render());
    expect(text).not.toContain("-# Parley");
    expect(text).not.toContain("— Parley");
  });

  test("stays within the Discord Components v2 limit of 40 total components", () => {
    function count(node: unknown): number {
      if (!node || typeof node !== "object") {
        return 0;
      }
      const record = node as { components?: unknown[]; accessory?: unknown };
      let total = 1;
      if (Array.isArray(record.components)) {
        for (const child of record.components) {
          total += count(child);
        }
      }
      if (record.accessory) {
        total += count(record.accessory);
      }
      return total;
    }

    const total = render().reduce((sum, node) => sum + count(node), 0);
    expect(total).toBeLessThanOrEqual(40);
  });
});

describe("user/ui — privacy page", () => {
  test("shows topic headers and moves the action buttons outside the container", () => {
    const [container, actions] = render({ page: 1 });
    const containerText = textOf(container);
    expect(containerText).toContain("Privacy & Data");
    expect(containerText).toContain("## Stats snapshot");
    expect(containerText).toContain("## Your data");
    // the action buttons no longer live inside the embed
    expect(containerText).not.toContain("Refresh stats");
    expect(containerText).not.toContain("Delete my data");
    // they sit in the outside action row instead
    const actionsText = textOf(actions);
    expect(actionsText).toContain("Refresh stats");
    expect(actionsText).toContain("Delete my data");
    expect(actionsText).toContain("Preferences");
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
