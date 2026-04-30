import { describe, expect, test } from "bun:test";
import {
  filterTournamentAutocompleteChoices,
  formatTournamentAutocompleteLabel,
} from "../../src/tournament/service";

describe("tournament autocomplete helpers", () => {
  test("filters by id prefix from cached tournaments", () => {
    const results = filterTournamentAutocompleteChoices(
      [
        {
          id: 42,
          name: "Spring Cup",
          nameNormalized: "spring cup",
          status: "open",
          teamCap: 8,
          entryCount: 3,
        },
        {
          id: 18,
          name: "Sunday Finals",
          nameNormalized: "sunday finals",
          status: "active",
          teamCap: 8,
          entryCount: 8,
        },
      ],
      { query: "4" },
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(42);
  });

  test("filters by normalized name substring", () => {
    const results = filterTournamentAutocompleteChoices(
      [
        {
          id: 42,
          name: "Spring Cup",
          nameNormalized: "spring cup",
          status: "open",
          teamCap: 8,
          entryCount: 3,
        },
        {
          id: 18,
          name: "Sunday Finals",
          nameNormalized: "sunday finals",
          status: "active",
          teamCap: 8,
          entryCount: 8,
        },
      ],
      { query: "sunday" },
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(18);
  });

  test("applies status filters", () => {
    const results = filterTournamentAutocompleteChoices(
      [
        {
          id: 42,
          name: "Spring Cup",
          nameNormalized: "spring cup",
          status: "open",
          teamCap: 8,
          entryCount: 3,
        },
        {
          id: 18,
          name: "Sunday Finals",
          nameNormalized: "sunday finals",
          status: "active",
          teamCap: 8,
          entryCount: 8,
        },
      ],
      { statuses: ["active"] },
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("active");
  });

  test("respects the 25-result cap", () => {
    const results = filterTournamentAutocompleteChoices(
      Array.from({ length: 30 }, (_, index) => ({
        id: index + 1,
        name: `Tournament ${index + 1}`,
        nameNormalized: `tournament ${index + 1}`,
        status: "open" as const,
        teamCap: 8,
        entryCount: index % 8,
      })),
    );

    expect(results).toHaveLength(25);
  });

  test("formats labels with status and capacity counts", () => {
    expect(
      formatTournamentAutocompleteLabel({
        id: 42,
        name: "Spring Cup",
        status: "open",
        teamCap: 8,
        entryCount: 3,
      }),
    ).toBe("#42 • Spring Cup • Open • 3/8");
  });
});
