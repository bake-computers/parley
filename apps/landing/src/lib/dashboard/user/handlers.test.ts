import { describe, expect, test } from "vitest";
import { normalizeUserSettings } from "./handlers";

describe("normalizeUserSettings", () => {
  test("maps protobuf enum names to dashboard region numbers", () => {
    expect(
      normalizeUserSettings({
        discordUserId: "123",
        matchmakingRegion: "REGION_NA" as unknown as number,
      }).matchmakingRegion,
    ).toBe(2);
  });

  test("keeps numeric region values", () => {
    expect(
      normalizeUserSettings({
        discordUserId: "123",
        matchmakingRegion: 3,
      }).matchmakingRegion,
    ).toBe(3);
  });
});
