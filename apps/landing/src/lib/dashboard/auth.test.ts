import { describe, expect, test } from "vitest";
import type { DiscordUser } from "../discord/oauth.js";
import { sessionCanManageGuild } from "./auth.js";

const testUser: DiscordUser = {
  id: "1",
  username: "u",
  global_name: null,
  avatar: null,
  discriminator: "0",
};

describe("sessionCanManageGuild", () => {
  test("returns true when guild is in session list", async () => {
    const session = {
      user: testUser,
      guilds: [{ id: "999", name: "G", icon: null, owner: true, permissions: "8" }],
      expiresAtMs: Date.now() + 60_000,
    };
    await expect(sessionCanManageGuild(session, "999")).resolves.toBe(true);
  });

  test("returns false for unknown guild", async () => {
    const session = {
      user: testUser,
      guilds: [{ id: "999", name: "G", icon: null, owner: true, permissions: "8" }],
      expiresAtMs: Date.now() + 60_000,
    };
    await expect(sessionCanManageGuild(session, "000")).resolves.toBe(false);
  });

  test("returns false when guild is listed but user lacks manage permission", async () => {
    const session = {
      user: testUser,
      guilds: [{ id: "999", name: "G", icon: null, owner: false, permissions: "0" }],
      expiresAtMs: Date.now() + 60_000,
    };
    await expect(sessionCanManageGuild(session, "999")).resolves.toBe(false);
  });
});