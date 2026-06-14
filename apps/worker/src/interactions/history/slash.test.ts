import { describe, test, expect, mock, beforeEach } from "bun:test";
import { ok, err } from "neverthrow";
import { ConnectError } from "@connectrpc/connect";

// Mutable mock state — closures read these at call time
let assertAcceptedReturn = true;
let listMatchesReturn: unknown;
let editReplyV2Calls: unknown[] = [];

// Module mocks (must precede dynamic import of the module under test)
const assertAcceptedSpy = mock(() => Promise.resolve(assertAcceptedReturn));

const invokeListMatchesSpy = mock(() => Promise.resolve(listMatchesReturn));

const editReplyV2Spy = mock((_interaction: unknown, container: unknown) => {
  editReplyV2Calls.push(container);
  return Promise.resolve(ok({}));
});

mock.module("../_shared/acceptance.js", () => ({
  assertAccepted: assertAcceptedSpy,
}));

mock.module("./rpc.js", () => ({
  invokeListMatches: invokeListMatchesSpy,
}));

mock.module("../../ui/discord.js", () => ({
  editReplyV2: editReplyV2Spy,
}));

// Dynamic import after mocks are registered
const { historyCommand } = await import("./slash.js");

// Helpers
function makeMockInteraction(guildId?: string) {
  return {
    context: { env: { ENGINE_SERVICE_URL: "http://localhost:50051" } },
    guildId,
    user: { id: "user-123" },
    deferReply: mock(() => Promise.resolve()),
    reply: mock(() => Promise.resolve(ok({}))),
  };
}

function makeMatch(index: number) {
  return {
    id: index,
    guildId: "guild-123",
    channelId: "ch-123",
    status: "completed",
    matchType: "ranked",
    winningTeam: index % 2 === 0 ? "team_a" : "team_b",
    balanceGap: 0.5,
    createdAtMs: BigInt(Date.now() - index * 3600000),
    participants: [
      {
        discordUserId: `p-${index}-a`,
        playerId: index * 2,
        team: "team_a",
        slot: 0,
        username: `Alice${index}`,
        balanceRating: 1.0,
      },
      {
        discordUserId: `p-${index}-b`,
        playerId: index * 2 + 1,
        team: "team_b",
        slot: 1,
        username: `Bob${index}`,
        balanceRating: 0.9,
      },
    ],
    publicUuid: `uuid-${index}`,
  };
}

describe("historyCommand", () => {
  beforeEach(() => {
    assertAcceptedReturn = true;
    listMatchesReturn = ok({ matches: [], nextCursor: "" });
    editReplyV2Calls = [];
    assertAcceptedSpy.mockClear();
    invokeListMatchesSpy.mockClear();
    editReplyV2Spy.mockClear();
  });

  test("returns 5 matches with masked links", async () => {
    const matches = Array.from({ length: 5 }, (_, i) => makeMatch(i));
    listMatchesReturn = ok({ matches, nextCursor: "" });

    const interaction = makeMockInteraction("guild-123");
    await historyCommand.execute(interaction as never);

    expect(interaction.deferReply).toHaveBeenCalledWith(true);
    expect(editReplyV2Spy).toHaveBeenCalledTimes(1);
    expect(editReplyV2Calls).toHaveLength(1);

    const json = JSON.stringify(editReplyV2Calls[0]);
    for (let i = 0; i < 5; i++) {
      expect(json).toContain(`uuid-${i}`);
      expect(json).toContain("View Report");
    }
  });

  test("handles empty guild (no matches)", async () => {
    listMatchesReturn = ok({ matches: [], nextCursor: "" });

    const interaction = makeMockInteraction("guild-123");
    await historyCommand.execute(interaction as never);

    expect(editReplyV2Calls).toHaveLength(1);
    const json = JSON.stringify(editReplyV2Calls[0]);
    expect(json).toContain("No matches played yet");
  });

  test("handles RPC error", async () => {
    listMatchesReturn = err(new ConnectError("internal error", 13, {}));

    const interaction = makeMockInteraction("guild-123");
    await historyCommand.execute(interaction as never);

    expect(editReplyV2Calls).toHaveLength(1);
    const json = JSON.stringify(editReplyV2Calls[0]);
    expect(json).toContain("Could not load match history");
  });

  test("enforces ToS gate", async () => {
    assertAcceptedReturn = false;

    const interaction = makeMockInteraction("guild-123");
    await historyCommand.execute(interaction as never);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(invokeListMatchesSpy).not.toHaveBeenCalled();
    expect(editReplyV2Calls).toHaveLength(0);
  });
});
