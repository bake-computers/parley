import { describe, expect, test } from "vitest";
import type { DiscordUser } from "./discord-oauth.js";
import { sessionCanManageGuild } from "./dashboard-auth.js";

const testUser: DiscordUser = {
  id: "1",
  username: "u",
  global_name: null,
  avatar: null,
  discriminator: "0",
};

describe("sessionCanManageGuild", () => {
  test("returns true when guild is in session list", () => {
    const session = {
      user: testUser,
      guilds: [{ id: "999", name: "G", icon: null, owner: true }],
      expiresAtMs: Date.now() + 60_000,
    };
    expect(sessionCanManageGuild(session, "999")).toBe(true);
  });

  test("returns false for unknown guild", () => {
    const session = {
      user: testUser,
      guilds: [{ id: "999", name: "G", icon: null, owner: true }],
      expiresAtMs: Date.now() + 60_000,
    };
    expect(sessionCanManageGuild(session, "000")).toBe(false);
  });
});