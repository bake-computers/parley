import { describe, expect, test, vi } from "vitest";
import { fetchGuildTextChannels, formatChannelLabel } from "./guild-channels";

describe("fetchGuildTextChannels", () => {
  test("returns sorted text and announcement channels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          { id: "2", name: "z-chat", type: 0 },
          { id: "1", name: "announcements", type: 5 },
          { id: "9", name: "voice", type: 2 },
        ]),
      ),
    );

    const channels = await fetchGuildTextChannels("guild", "token");
    expect(channels).toEqual([
      { id: "1", name: "announcements" },
      { id: "2", name: "z-chat" },
    ]);
  });
});

describe("formatChannelLabel", () => {
  test("prefixes channel name with hash", () => {
    expect(formatChannelLabel({ id: "1", name: "general" })).toBe("#general");
  });
});