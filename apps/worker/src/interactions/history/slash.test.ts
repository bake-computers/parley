import { describe, test, expect, mock, beforeEach } from "bun:test";
import { ok, err } from "neverthrow";
import { ConnectError } from "@connectrpc/connect";
import { HISTORY_PAGE_WINDOW } from "#/interactions/history/constants";

let listMatchesReturn: unknown;
let editReplyV2Calls: unknown[] = [];

const invokeListMatchesSpy = mock((_input: unknown) => Promise.resolve(listMatchesReturn));

const editReplyV2Spy = mock((_interaction: unknown, container: unknown) => {
  editReplyV2Calls.push(container);
  return Promise.resolve(ok({}));
});

mock.module("./rpc.js", () => ({
  invokeListMatches: invokeListMatchesSpy,
}));

mock.module("../../ui/discord.js", () => ({
  editReplyV2: editReplyV2Spy,
  COMPONENTS_V2_EPHEMERAL: 64 | 32768,
}));

const { historyCommand } = await import("#/interactions/history/slash");

// Helpers
function makeMockInteraction(guildId?: string) {
  const store = new Map<string, unknown>();
  return {
    context: {
      env: { ENGINE_SERVICE_URL: "http://localhost:50051" },
      get: (key: string) => store.get(key),
      set: (key: string, value: unknown) => {
        store.set(key, value);
      },
    },
    guildId,
    user: { id: "user-123" },
    commandName: "history",
    deferred: true,
    replied: false,
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
    matchType: "internal",
    winningTeam: "a",
    balanceGap: 0.5,
    createdAtMs: BigInt(Date.now() - index * 3600000),
    participants: [
      {
        discordUserId: `p-${index}-a`,
        playerId: index * 2,
        team: "a",
        slot: 0,
        username: `Alice${index}`,
        balanceRating: 1.0,
        kills: 4,
        deaths: 2,
        assists: 3,
        ratingDelta: 12,
      },
      {
        discordUserId: `p-${index}-b`,
        playerId: index * 2 + 1,
        team: "b",
        slot: 1,
        username: `Bob${index}`,
        balanceRating: 0.9,
        kills: 1,
        deaths: 5,
        assists: 0,
        ratingDelta: -8,
      },
    ],
    publicUuid: `uuid-${index}`,
  };
}

describe("historyCommand", () => {
  beforeEach(() => {
    listMatchesReturn = ok({ matches: [], nextCursor: "" });
    editReplyV2Calls = [];
    invokeListMatchesSpy.mockClear();
    editReplyV2Spy.mockClear();
  });

  test("renders the first match page with KDA and deltas", async () => {
    const matches = Array.from({ length: 3 }, (_, i) => makeMatch(i));
    listMatchesReturn = ok({ matches, nextCursor: "" });

    const interaction = makeMockInteraction("guild-123");
    await historyCommand.execute(interaction as never);

    expect(invokeListMatchesSpy).toHaveBeenCalledTimes(1);
    expect(invokeListMatchesSpy.mock.calls[0]![0]).toMatchObject({
      limit: HISTORY_PAGE_WINDOW,
    });

    expect(editReplyV2Calls).toHaveLength(1);
    const json = JSON.stringify(editReplyV2Calls[0]);
    expect(json).toContain("Alice0");
    expect(json).toContain("4/2/3");
    expect(json).toContain("(+12)");
    expect(json).not.toContain("Alice1");
    expect(json).toContain("Page **1** of **3**");
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
});
