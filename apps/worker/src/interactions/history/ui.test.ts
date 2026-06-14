import { describe, test, expect } from "bun:test";
import type { Match, MatchParticipant } from "@parley/proto/matchmaking/v1/matchmaking_pb.js";
import { buildHistoryCard } from "./ui.js";

function makeParticipant(
  team: string,
  username: string,
  discordUserId: string,
): MatchParticipant {
  return {
    $typeName: "parley.matchmaking.v1.MatchParticipant" as const,
    discordUserId,
    username,
    team,
    playerId: 0,
    slot: 0,
    balanceRating: 1.0,
  } as unknown as MatchParticipant;
}

function makeMatch(overrides: Record<string, unknown> = {}): Match {
  return {
    $typeName: "parley.matchmaking.v1.Match" as const,
    id: 1,
    guildId: "guild-123",
    channelId: "ch-123",
    status: "completed",
    matchType: "ranked",
    winningTeam: "team_a",
    balanceGap: 0.5,
    createdAtMs: BigInt(1700000000000),
    participants: [
      makeParticipant("team_a", "Alice", "user-1"),
      makeParticipant("team_b", "Bob", "user-2"),
    ],
    publicUuid: "match-uuid-1",
    ...overrides,
  } as unknown as Match;
}

describe("buildHistoryCard", () => {
  test("renders all matches", () => {
    const matches = Array.from({ length: 5 }, (_, i) =>
      makeMatch({
        id: i,
        publicUuid: `uuid-${i}`,
        participants: [
          makeParticipant("team_a", `Alice${i}`, `a-${i}`),
          makeParticipant("team_b", `Bob${i}`, `b-${i}`),
        ],
      }),
    );
    const card = buildHistoryCard(matches, "guild-123");
    const json = JSON.stringify(card.toJSON());

    for (let i = 0; i < 5; i++) {
      expect(json).toContain(`uuid-${i}`);
      expect(json).toContain(`Alice${i}`);
    }
    expect(json).toContain("Recent Matches");
  });

  test("empty state", () => {
    const card = buildHistoryCard([], "guild-123");
    const json = JSON.stringify(card.toJSON());
    expect(json).toContain("No matches played yet");
  });

  test("respects character budget", () => {
    const longName = "A".repeat(200);
    const matches = Array.from({ length: 5 }, (_, i) =>
      makeMatch({
        id: i,
        publicUuid: `uuid-${i}`,
        participants: [
          makeParticipant("team_a", longName, `a-${i}`),
          makeParticipant("team_b", longName, `b-${i}`),
        ],
      }),
    );
    const card = buildHistoryCard(matches, "guild-123");
    const json = JSON.stringify(card.toJSON());

    // With 200-char usernames each match text is ~500 chars.
    // Header (~28) + 3 matches (~1500) fits; match 4 would exceed the 2000 budget.
    expect(json).toContain("uuid-0");
    expect(json).not.toContain("uuid-4");
  });

  test("uses mvpUserId field when present, no badge when absent", () => {
    // Match WITH MVP
    const matchWithMvp = makeMatch({
      publicUuid: "mvp-match",
      mvpUserId: "user-1",
      participants: [
        makeParticipant("team_a", "Alice", "user-1"),
        makeParticipant("team_b", "Bob", "user-2"),
      ],
    });
    const cardWithMvp = buildHistoryCard([matchWithMvp], "guild-123");
    const jsonWithMvp = JSON.stringify(cardWithMvp.toJSON());
    expect(jsonWithMvp).toContain("MVP");
    expect(jsonWithMvp).toContain("Alice");

    // Match WITHOUT MVP (future-proofing: mvpUserId undefined)
    const matchWithoutMvp = makeMatch({
      publicUuid: "no-mvp-match",
      mvpUserId: undefined,
      participants: [
        makeParticipant("team_a", "Charlie", "user-3"),
        makeParticipant("team_b", "Dave", "user-4"),
      ],
    });
    const cardWithoutMvp = buildHistoryCard([matchWithoutMvp], "guild-123");
    const jsonWithoutMvp = JSON.stringify(cardWithoutMvp.toJSON());
    expect(jsonWithoutMvp).not.toContain("MVP");

    // Match with mvpUserId null (future-proofing)
    const matchNullMvp = makeMatch({
      publicUuid: "null-mvp-match",
      mvpUserId: null,
      participants: [
        makeParticipant("team_a", "Eve", "user-5"),
        makeParticipant("team_b", "Frank", "user-6"),
      ],
    });
    const cardNullMvp = buildHistoryCard([matchNullMvp], "guild-123");
    const jsonNullMvp = JSON.stringify(cardNullMvp.toJSON());
    expect(jsonNullMvp).not.toContain("MVP");
  });
});
