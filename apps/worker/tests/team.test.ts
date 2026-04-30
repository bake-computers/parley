import { describe, expect, test } from "bun:test";
import { processTournamentAutoStarts } from "../src/interactions/team";

describe("team scheduled jobs", () => {
  test("processTournamentAutoStarts returns the number of started tournaments", async () => {
    await expect(processTournamentAutoStarts({}, Date.now())).resolves.toBe(0);
  });
});
