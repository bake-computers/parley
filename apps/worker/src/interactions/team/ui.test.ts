import { describe, expect, test } from "bun:test";
import type { Match } from "@parley/proto/matchmaking/v1/matchmaking_pb.js";
import {
  buildFinalCard,
  buildScoreboardCard,
  buildTeamSetupCard,
  buildWinnerPromptCard,
} from "#/interactions/team/ui";

const match = {
  id: 42,
  status: "active",
  participants: [
    { discordUserId: "u1", team: "a", username: "alice", kills: 4, deaths: 5, assists: 2 },
    { discordUserId: "u2", team: "b", username: "", kills: 1, deaths: 0, assists: 0 },
  ],
} as Match;

describe("buildTeamSetupCard", () => {
  test("returns a container plus the user-select row", () => {
    const card = buildTeamSetupCard();
    expect(card).toHaveLength(2);
    const row = card[1]!.toJSON() as { components: { custom_id: string }[] };
    expect(row.components[0]!.custom_id).toBe("team/select");
  });
});

describe("buildScoreboardCard", () => {
  test("embeds round-log and end buttons with the match id", () => {
    const card = buildScoreboardCard(match);
    const row = card[1]!.toJSON() as { components: { custom_id: string }[] };
    const ids = row.components.map((c) => c.custom_id);
    expect(ids).toContain("team/round-log/42/a");
    expect(ids).toContain("team/round-log/42/b");
    expect(ids).toContain("team/end/42");
  });
});

describe("buildWinnerPromptCard", () => {
  test("offers both teams", () => {
    const card = buildWinnerPromptCard(42);
    const row = card[1]!.toJSON() as { components: { custom_id: string }[] };
    const ids = row.components.map((c) => c.custom_id);
    expect(ids).toEqual(["team/winner/42/a", "team/winner/42/b"]);
  });
});

describe("buildFinalCard", () => {
  test("renders a single container", () => {
    const card = buildFinalCard({ ...match, winningTeam: "a" });
    expect(card.toJSON()).toBeDefined();
  });
});
