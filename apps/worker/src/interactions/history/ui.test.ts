import { describe, test, expect } from "bun:test";
import type { Match, MatchParticipant } from "@parley/proto/matchmaking/v1/matchmaking_pb.js";
import { UI_TOKENS } from "#/ui/tokens";
import { buildHistoryCard } from "#/interactions/history/ui";

function makeParticipant(
  team: string,
  username: string,
  discordUserId: string,
  kda?: [number, number, number],
  ratingDelta?: number,
): MatchParticipant {
  return {
    $typeName: "parley.matchmaking.v1.MatchParticipant" as const,
    discordUserId,
    username,
    team,
    playerId: 0,
    slot: 0,
    balanceRating: 1.0,
    kills: kda?.[0],
    deaths: kda?.[1],
    assists: kda?.[2],
    ratingDelta,
  } as unknown as MatchParticipant;
}

function makeMatch(index: number, overrides: Record<string, unknown> = {}): Match {
  return {
    $typeName: "parley.matchmaking.v1.Match" as const,
    id: index,
    guildId: "guild-123",
    channelId: "ch-123",
    status: "completed",
    matchType: "internal",
    winningTeam: "a",
    balanceGap: 0.5,
    createdAtMs: BigInt(1700000000000),
    participants: [
      makeParticipant("a", `Alice${index}`, `a-${index}`, [4, 2, 3], 12),
      makeParticipant("b", `Bob${index}`, `b-${index}`, [1, 5, 0], -8),
    ],
    publicUuid: `uuid-${index}`,
    ...overrides,
  } as unknown as Match;
}

function navButtons(card: ReturnType<typeof buildHistoryCard>) {
  const row = card[1]!.toJSON() as {
    components: { custom_id: string; disabled?: boolean }[];
  };
  return row.components;
}

describe("buildHistoryCard", () => {
  test("renders only the requested page", () => {
    const matches = Array.from({ length: 3 }, (_, i) => makeMatch(i));
    const json = JSON.stringify(buildHistoryCard(matches, 1).map((c) => c.toJSON()));

    expect(json).toContain("Alice1");
    expect(json).not.toContain("Alice0");
    expect(json).not.toContain("Alice2");
    expect(json).toContain("Page **2** of **3**");
  });

  test("clamps out-of-range pages", () => {
    const matches = Array.from({ length: 3 }, (_, i) => makeMatch(i));
    const high = JSON.stringify(buildHistoryCard(matches, 99).map((c) => c.toJSON()));
    expect(high).toContain("Alice2");
    const low = JSON.stringify(buildHistoryCard(matches, -5).map((c) => c.toJSON()));
    expect(low).toContain("Alice0");
  });

  test("renders KDA and rating delta per player", () => {
    const json = JSON.stringify(buildHistoryCard([makeMatch(0)], 0).map((c) => c.toJSON()));

    expect(json).toContain("4/2/3");
    expect(json).toContain("(+12)");
    expect(json).toContain("(-8)");
  });

  test("omits the delta suffix when ratingDelta is absent", () => {
    const match = makeMatch(0, {
      participants: [
        makeParticipant("a", "Alice", "a-0", [1, 1, 1]),
        makeParticipant("b", "Bob", "b-0"),
      ],
    });
    const json = JSON.stringify(buildHistoryCard([match], 0).map((c) => c.toJSON()));

    expect(json).toContain("1/1/1");
    expect(json).not.toContain("(+");
    expect(json).not.toContain("(-");
  });

  test("bolds the winning team", () => {
    const json = JSON.stringify(buildHistoryCard([makeMatch(0)], 0).map((c) => c.toJSON()));
    expect(json).toContain("**Team A — winner**");
    expect(json).not.toContain("**Team B — winner**");
  });

  test("nav row disables Previous on the first page and Next on the last", () => {
    const matches = Array.from({ length: 3 }, (_, i) => makeMatch(i));

    const first = navButtons(buildHistoryCard(matches, 0));
    expect(first[0]!.custom_id).toBe("history/page/-1");
    expect(first[0]!.disabled).toBe(true);
    expect(first[1]!.custom_id).toBe("history/page/1");
    expect(first[1]!.disabled).toBe(false);

    const last = navButtons(buildHistoryCard(matches, 2));
    expect(last[0]!.custom_id).toBe("history/page/1");
    expect(last[0]!.disabled).toBe(false);
    expect(last[1]!.disabled).toBe(true);

    const middle = navButtons(buildHistoryCard(matches, 1));
    expect(middle[0]!.custom_id).toBe("history/page/0");
    expect(middle[1]!.custom_id).toBe("history/page/2");
  });

  test("empty state has no nav row", () => {
    const card = buildHistoryCard([], 0);
    expect(card).toHaveLength(1);
    const json = JSON.stringify(card[0]!.toJSON());
    expect(json).toContain("No matches played yet");
  });

  test("handles missing participants without crashing", () => {
    const card = buildHistoryCard([makeMatch(0, { participants: undefined })], 0);
    const json = JSON.stringify(card.map((c) => c.toJSON()));
    expect(json).toContain("Team A");
  });

  test("uses the main accent", () => {
    const card = buildHistoryCard([makeMatch(0)], 0);
    expect((card[0]!.toJSON() as { accent_color: number }).accent_color).toBe(UI_TOKENS.main);
  });

  test("shows MVP line when present, not when absent", () => {
    const withMvp = makeMatch(0, { mvpUserId: "a-0" });
    expect(JSON.stringify(buildHistoryCard([withMvp], 0).map((c) => c.toJSON()))).toContain(
      "**MVP** Alice0",
    );
    const withoutMvp = makeMatch(0, { mvpUserId: undefined });
    expect(JSON.stringify(buildHistoryCard([withoutMvp], 0).map((c) => c.toJSON()))).not.toContain(
      "MVP",
    );
  });
});
