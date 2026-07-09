import { describe, expect, test } from "bun:test";
import type { JoinQueueResponse } from "@parley/proto";
import {
  buildQueueActiveCard,
  buildQueueJoinedCard,
  buildQueueServerOnlyCard,
} from "#/interactions/queue/ui";

describe("queue cards", () => {
  test("renders a waiting queue with an exit hint", () => {
    const card = buildQueueJoinedCard({
      success: true,
      status: "waiting",
      queueId: 8,
      poolWaitingPlayers: 3,
      teamA: [],
      teamB: [],
    } as unknown as JoinQueueResponse).toJSON();

    const json = JSON.stringify(card);
    expect(json).toContain("You’re in the Queue");
    expect(json).toContain("/queue");
    expect(json).toContain("3");
  });

  test("renders immediate matches with both rosters", () => {
    const card = buildQueueJoinedCard({
      success: true,
      status: "matched",
      matchId: 24,
      winProbability: 0.625,
      teamA: [{ discordUserId: "1", username: "Alpha" }],
      teamB: [{ discordUserId: "2", username: "Bravo" }],
    } as unknown as JoinQueueResponse).toJSON();

    const json = JSON.stringify(card);
    expect(json).toContain("Match Found");
    expect(json).toContain("Alpha");
    expect(json).toContain("Bravo");
    expect(json).toContain("63%");
  });

  test("does not offer mutation for an already matched queue", () => {
    const card = buildQueueActiveCard({
      success: true,
      status: "matched",
      matchId: 24,
      poolWaitingPlayers: 0,
      poolWaitingStacks: 0,
    } as never).toJSON();
    expect(JSON.stringify(card)).toContain("Match **#24**");
  });

  test("explains that direct messages cannot queue", () => {
    expect(JSON.stringify(buildQueueServerOnlyCard().toJSON())).toContain("Server-only");
  });
});
