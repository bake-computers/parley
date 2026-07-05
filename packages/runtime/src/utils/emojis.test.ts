import { describe, expect, test } from "bun:test";
import { formatApplicationEmoji, type ApplicationEmojiCatalog } from "./emojis.js";

const catalog: ApplicationEmojiCatalog = {
  pin: {
    id: "1515457667827503294",
    name: "pin",
    discordName: "pin",
    animated: false,
  },
  rank_gold: {
    id: "1515457664409272431",
    name: "rank_gold",
    discordName: "gold",
    animated: false,
  },
};

describe("formatApplicationEmoji", () => {
  test("renders canonical emoji names", () => {
    expect(formatApplicationEmoji(catalog, "pin")).toBe("<:pin:1515457667827503294>");
  });

  test("renders aliased rank emojis with their Discord-side name", () => {
    expect(formatApplicationEmoji(catalog, "rank_gold")).toBe("<:gold:1515457664409272431>");
  });

  test("returns null when emoji is missing", () => {
    expect(formatApplicationEmoji(catalog, "rank_challenger")).toBeNull();
  });
});
