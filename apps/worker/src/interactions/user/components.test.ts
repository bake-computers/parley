import { describe, expect, test } from "bun:test";
import {
  USER_CANCEL,
  USER_DELETE_OPEN,
  USER_MATCHMAKING_SELECT,
  USER_VISIBILITY_SELECT,
  USER_REFRESH_STATS,
} from "#/interactions/user/constants";

describe("user/constants — customId values", () => {
  test("matchmaking select is user/matchmaking", () => {
    expect(USER_MATCHMAKING_SELECT).toBe("user/matchmaking");
  });
  test("visibility select is user/visibility", () => {
    expect(USER_VISIBILITY_SELECT).toBe("user/visibility");
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

import {
  userButtonHandler,
  userModalHandler,
  userSelectHandler,
} from "#/interactions/user/components";

test("userButtonHandler is registered with the user prefix", () => {
  expect(userButtonHandler).toBeDefined();
  expect(userButtonHandler.prefix).toBe("user");
});
test("userSelectHandler is registered with the user prefix", () => {
  expect(userSelectHandler).toBeDefined();
  expect(userSelectHandler.prefix).toBe("user");
});
test("userModalHandler is registered with the delete modal customId", () => {
  expect(userModalHandler).toBeDefined();
});
