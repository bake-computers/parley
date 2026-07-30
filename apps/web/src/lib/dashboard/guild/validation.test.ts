import { describe, expect, test } from "vite-plus/test";
import {
  parsePlatformsInput,
  suggestTeamFormats,
  validateDailyMatchLimit,
  validateDiscordSnowflake,
  validateEloRange,
  validatePlatforms,
  validateTeamFormat,
} from "./validation.js";

describe("validateTeamFormat", () => {
  test("accepts known formats", () => {
    expect(validateTeamFormat("5v5")).toBeNull();
    expect(validateTeamFormat(" 3V3 ")).toBeNull();
  });

  test("rejects invalid formats", () => {
    expect(validateTeamFormat("")).toMatch(/required/);
    expect(validateTeamFormat("5vs5")).toMatch(/like 5v5/);
    expect(validateTeamFormat("5v4")).toMatch(/must match/);
  });
});

describe("suggestTeamFormats", () => {
  test("filters by prefix", () => {
    expect(suggestTeamFormats("5")).toEqual(["5v5"]);
    expect(suggestTeamFormats("")).toHaveLength(5);
    expect(suggestTeamFormats()).toHaveLength(5);
  });
});

describe("validateDiscordSnowflake", () => {
  test("allows empty", () => {
    expect(validateDiscordSnowflake("", "Channel")).toBeNull();
    expect(validateDiscordSnowflake(undefined, "Channel")).toBeNull();
  });

  test("rejects invalid ids", () => {
    expect(validateDiscordSnowflake("abc", "Channel")).toMatch(/valid Discord/);
    expect(validateDiscordSnowflake("123", "Channel")).toMatch(/valid Discord/);
  });

  test("accepts snowflakes", () => {
    expect(validateDiscordSnowflake("123456789012345678", "Channel")).toBeNull();
  });
});

describe("validateEloRange", () => {
  test("checks ordering", () => {
    expect(validateEloRange(2000, 1500)).toMatch(/cannot exceed/);
    expect(validateEloRange(0, 0)).toBeNull();
  });
});

describe("platforms", () => {
  test("parses and validates", () => {
    expect(parsePlatformsInput("pc, xbox")).toEqual(["pc", "xbox"]);
    expect(validatePlatforms(["pc"])).toBeNull();
    expect(validatePlatforms(["nintendo"])).toMatch(/Unknown platform/);
  });
});

describe("validateDailyMatchLimit", () => {
  test("accepts zero as unlimited", () => {
    expect(validateDailyMatchLimit(0)).toBeNull();
  });

  test("rejects negative", () => {
    expect(validateDailyMatchLimit(-1)).toMatch(/whole number/);
  });
});
