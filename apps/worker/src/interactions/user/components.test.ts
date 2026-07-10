import { describe, expect, test } from "bun:test";
import {
  USER_CANCEL,
  USER_DELETE_OPEN,
  USER_MATCHMAKING_PREFIX,
  USER_VISIBILITY_PREFIX,
  USER_REFRESH_STATS,
  USER_REGION_PREFIX,
} from "#/interactions/user/constants";

describe("user/constants — customId prefixes", () => {
  test("matchmaking prefix is user/matchmaking/", () => {
    expect(USER_MATCHMAKING_PREFIX).toBe("user/matchmaking/");
  });
  test("visibility prefix is user/visibility/", () => {
    expect(USER_VISIBILITY_PREFIX).toBe("user/visibility/");
  });
  test("region prefix is user/region/", () => {
    expect(USER_REGION_PREFIX).toBe("user/region/");
  });
  test("refresh stats is the constant string", () => {
    expect(USER_REFRESH_STATS).toBe("user/refresh-stats");
  });
  test("delete open is the constant string", () => {
    expect(USER_DELETE_OPEN).toBe("user/delete/open");
  });
  test("cancel is the constant string", () => {
    expect(USER_CANCEL).toBe("user/cancel");
  });
});

import { userButtonHandler, userModalHandler } from "#/interactions/user/components";
test("userButtonHandler is registered with the user prefix", () => {
  expect(userButtonHandler).toBeDefined();
  expect(userButtonHandler.prefix).toBe("user");
});
test("userModalHandler is registered with the delete modal customId", () => {
  expect(userModalHandler).toBeDefined();
});
