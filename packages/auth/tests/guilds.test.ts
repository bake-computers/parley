import { describe, expect, test } from "bun:test";
import { filterGuildsByPermissions, GuildWithPermissions } from "../src/index";

describe("guilds permission filtering", () => {
  test("filters guilds to those with ADMINISTRATOR or MANAGE_GUILD permissions", () => {
    const input: GuildWithPermissions[] = [
      { id: "g1", name: "G1", icon: null, permissions: 0x0 }, // no perms
      { id: "g2", name: "G2", icon: null, permissions: 0x8 }, // ADMINISTRATOR
      { id: "g3", name: "G3", icon: null, permissions: 0x20 }, // MANAGE_GUILD
      { id: "g4", name: "G4", icon: null, permissions: 0x4 | 0x8 }, // ADMINISTRATOR + others
    ];

    const result = filterGuildsByPermissions(input);
    expect(result).toHaveLength(3);
    const ids = result.map((g) => g.id);
    expect(ids).toContain("g2");
    expect(ids).toContain("g3");
    expect(ids).toContain("g4");
  });
});
