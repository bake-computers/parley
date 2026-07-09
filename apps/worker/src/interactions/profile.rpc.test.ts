import { describe, expect, test } from "bun:test";
import { ConnectError } from "@connectrpc/connect";
import { invokeLookupByDiscord } from "#/interactions/profile.js";

describe("invokeLookupByDiscord", () => {
  test("wraps a successful response in Ok", async () => {
    const client = {
      lookupByDiscord: async () => ({
        success: true,
        identities: [],
      }),
    };
    const r = await invokeLookupByDiscord(client as never, {
      discordUserId: "u1",
      game: 0,
    });
    expect(r.isOk()).toBe(true);
  });

  test("wraps ConnectError in Err", async () => {
    const client = {
      lookupByDiscord: async () => {
        throw new ConnectError("backend unreachable", 14);
      },
    };
    const r = await invokeLookupByDiscord(client as never, {
      discordUserId: "u1",
      game: 0,
    });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.message).toContain("backend unreachable");
    }
  });
});
