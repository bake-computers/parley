import { describe, expect, test } from "vite-plus/test";
import { canManageGuild, filterManageableGuilds } from "./permissions.js";
import type { DiscordOAuthGuild } from "./oauth.js";

function guild(
  overrides: Partial<DiscordOAuthGuild> & Pick<DiscordOAuthGuild, "id" | "name">,
): DiscordOAuthGuild {
  return {
    icon: null,
    owner: false,
    permissions: "0",
    ...overrides,
  };
}

describe("discord permissions", () => {
  test("owner always manageable", () => {
    expect(canManageGuild(guild({ id: "1", name: "A", owner: true, permissions: "0" }))).toBe(true);
  });

  test("MANAGE_GUILD bit", () => {
    const manage = (1n << 5n).toString();
    expect(canManageGuild(guild({ id: "1", name: "A", permissions: manage }))).toBe(true);
  });

  test("ADMINISTRATOR bit", () => {
    const admin = (1n << 3n).toString();
    expect(canManageGuild(guild({ id: "1", name: "A", permissions: admin }))).toBe(true);
  });

  test("no manage permission", () => {
    expect(canManageGuild(guild({ id: "1", name: "A", permissions: "1048576" }))).toBe(false);
  });

  test("canManageCookieGuild mirrors oauth guild checks", async () => {
    const { canManageCookieGuild } = await import("./permissions.js");
    expect(
      canManageCookieGuild({
        id: "1",
        name: "A",
        icon: null,
        owner: false,
        permissions: (1n << 5n).toString(),
      }),
    ).toBe(true);
  });

  test("filter sorts by name", () => {
    const list = filterManageableGuilds([
      guild({ id: "2", name: "Zeta", owner: true }),
      guild({ id: "1", name: "Alpha", permissions: (1n << 5n).toString() }),
      guild({ id: "3", name: "Muted", permissions: "0" }),
    ]);
    expect(list.map((g) => g.name)).toEqual(["Alpha", "Zeta"]);
  });
});
