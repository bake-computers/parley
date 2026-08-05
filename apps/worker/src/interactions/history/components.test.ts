import { describe, test, expect, mock, beforeEach } from "bun:test";
import { ok, err } from "neverthrow";
import { ConnectError } from "@connectrpc/connect";

let listMatchesReturn: unknown;
let editReplyV2Calls: unknown[] = [];

const invokeListMatchesSpy = mock(() => Promise.resolve(listMatchesReturn));

const editReplyV2Spy = mock((_interaction: unknown, card: unknown) => {
  editReplyV2Calls.push(card);
  return Promise.resolve(ok({}));
});

mock.module("./rpc.js", () => ({
  invokeListMatches: invokeListMatchesSpy,
}));

mock.module("../../ui/discord.js", () => ({
  editReplyV2: editReplyV2Spy,
  COMPONENTS_V2_EPHEMERAL: 64 | 32768,
}));

const { historyButtonHandler } = await import("#/interactions/history/components");

function makeMockInteraction(customId: string, guildId?: string) {
  return {
    id: "interaction-1",
    customId,
    guildId,
    context: { env: { ENGINE_SERVICE_URL: "http://localhost:50051" } },
    deferUpdate: mock(() => Promise.resolve(ok({}))),
  };
}

function makeMatch(index: number) {
  return {
    id: index,
    guildId: "guild-123",
    channelId: "ch-123",
    status: "completed",
    matchType: "internal",
    winningTeam: "a",
    balanceGap: 0.5,
    createdAtMs: BigInt(1700000000000),
    participants: [
      {
        discordUserId: `a-${index}`,
        playerId: 0,
        team: "a",
        slot: 0,
        username: `Alice${index}`,
        balanceRating: 1.0,
      },
      {
        discordUserId: `b-${index}`,
        playerId: 1,
        team: "b",
        slot: 0,
        username: `Bob${index}`,
        balanceRating: 1.0,
      },
    ],
    publicUuid: `uuid-${index}`,
  };
}

describe("historyButtonHandler", () => {
  beforeEach(() => {
    listMatchesReturn = ok({ matches: [], nextCursor: "" });
    editReplyV2Calls = [];
    invokeListMatchesSpy.mockClear();
    editReplyV2Spy.mockClear();
  });

  test("is registered with the history prefix", () => {
    expect(historyButtonHandler.prefix).toBe("history");
  });

  test("renders the requested page", async () => {
    listMatchesReturn = ok({
      matches: Array.from({ length: 3 }, (_, i) => makeMatch(i)),
      nextCursor: "",
    });

    const interaction = makeMockInteraction("history/page/2", "guild-123");
    await historyButtonHandler.execute(interaction as never);

    expect(invokeListMatchesSpy).toHaveBeenCalledTimes(1);
    expect(editReplyV2Calls).toHaveLength(1);
    const json = JSON.stringify(editReplyV2Calls[0]);
    expect(json).toContain("Alice2");
    expect(json).not.toContain("Alice0");
    expect(json).toContain("Page **3** of **3**");
  });

  test("clamps a stale page beyond the refetched window", async () => {
    listMatchesReturn = ok({ matches: [makeMatch(0)], nextCursor: "" });

    const interaction = makeMockInteraction("history/page/7", "guild-123");
    await historyButtonHandler.execute(interaction as never);

    expect(editReplyV2Calls).toHaveLength(1);
    const json = JSON.stringify(editReplyV2Calls[0]);
    expect(json).toContain("Page **1** of **1**");
  });

  test("ignores malformed custom ids", async () => {
    const interaction = makeMockInteraction("history/page/x", "guild-123");
    await historyButtonHandler.execute(interaction as never);

    expect(invokeListMatchesSpy).not.toHaveBeenCalled();
    expect(editReplyV2Calls).toHaveLength(0);
  });

  test("ignores clicks outside a server", async () => {
    const interaction = makeMockInteraction("history/page/0");
    await historyButtonHandler.execute(interaction as never);

    expect(invokeListMatchesSpy).not.toHaveBeenCalled();
  });

  test("shows an error card on RPC failure", async () => {
    listMatchesReturn = err(new ConnectError("internal error", 13, {}));

    const interaction = makeMockInteraction("history/page/0", "guild-123");
    await historyButtonHandler.execute(interaction as never);

    expect(editReplyV2Calls).toHaveLength(1);
    const json = JSON.stringify(editReplyV2Calls[0]);
    expect(json).toContain("Could not load match history");
  });
});
