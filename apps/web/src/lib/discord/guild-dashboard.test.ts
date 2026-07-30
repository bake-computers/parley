import { describe, expect, test } from "vite-plus/test";
import type { CookieGuild, PublicGuild } from "./oauth.js";
import {
  partitionDashboardGuilds,
  publicGuildsForDashboard,
  sortDashboardGuilds,
} from "./guild-dashboard.js";

function guild(overrides: Partial<CookieGuild> & Pick<CookieGuild, "id" | "name">): CookieGuild {
  return {
    icon: null,
    owner: false,
    permissions: "0",
    ...overrides,
  };
}

describe("publicGuildsForDashboard", () => {
  test("marks manageable guilds without bot as invite-ready", async () => {
    const manage = (1n << 5n).toString();
    const rows = await publicGuildsForDashboard(
      [guild({ id: "1", name: "Alpha", permissions: manage }), guild({ id: "2", name: "Beta" })],
      "client-id",
    );
    expect(rows[0]).toMatchObject({
      id: "1",
      canManage: true,
      parleyInstalled: false,
      inviteUrl: expect.stringContaining("guild_id=1"),
    });
    expect(rows[1]).toMatchObject({
      id: "2",
      canManage: false,
      parleyInstalled: false,
      inviteUrl: null,
    });
  });
});

function publicGuild(
  overrides: Partial<PublicGuild> & Pick<PublicGuild, "id" | "name">,
): PublicGuild {
  return {
    icon: null,
    owner: false,
    canManage: false,
    parleyInstalled: false,
    inviteUrl: null,
    ...overrides,
  };
}

describe("sortDashboardGuilds", () => {
  test("puts needs-bot and ready guilds before view-only", () => {
    const sorted = sortDashboardGuilds([
      publicGuild({ id: "1", name: "Locked", canManage: false }),
      publicGuild({ id: "2", name: "Ready", canManage: true, parleyInstalled: true }),
      publicGuild({
        id: "3",
        name: "Needs bot",
        canManage: true,
        inviteUrl: "https://discord.com",
      }),
    ]);
    expect(sorted.map((g) => g.id)).toEqual(["3", "2", "1"]);
  });
});

describe("partitionDashboardGuilds", () => {
  test("splits manageable guilds from view-only", () => {
    const { primary, other } = partitionDashboardGuilds([
      publicGuild({ id: "1", name: "Locked" }),
      publicGuild({ id: "2", name: "Ready", canManage: true, parleyInstalled: true }),
    ]);
    expect(primary.map((g) => g.id)).toEqual(["2"]);
    expect(other.map((g) => g.id)).toEqual(["1"]);
  });
});
