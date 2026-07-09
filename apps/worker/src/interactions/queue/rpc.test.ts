import { describe, expect, test } from "bun:test";
import { ConnectError } from "@connectrpc/connect";
import { Game, type JoinQueueResponse } from "@parley/proto";
import { invokeGetQueueStatus, invokeJoinQueue, invokeLeaveQueue } from "#/interactions/queue/rpc";

const joinRequest = {
  guildId: "guild-1",
  channelId: "channel-1",
  captainDiscordUserId: "user-1",
  game: Game.R6,
  discordUserIds: ["user-1"],
  teamSize: 0,
};

describe("queue RPC wrappers", () => {
  test("forwards the solo join request", async () => {
    const calls: unknown[] = [];
    const client = {
      getQueueStatus: async () => ({ success: true, status: "idle" }),
      joinQueue: async (request: unknown) => {
        calls.push(request);
        return { success: true, status: "waiting", queueId: 12 } as JoinQueueResponse;
      },
      leaveQueue: async () => ({ success: true }),
    };

    const result = await invokeJoinQueue(client as never, joinRequest as never);
    expect(result.isOk()).toBe(true);
    expect(calls).toEqual([joinRequest]);
  });

  test("preserves Connect errors and wraps ordinary errors", async () => {
    const original = new ConnectError("queue unavailable", 14, {});
    const client = {
      getQueueStatus: async () => Promise.reject(original),
      joinQueue: async () => Promise.reject(new Error("no route")),
      leaveQueue: async () => ({ success: true }),
    };

    const status = await invokeGetQueueStatus(client as never, {
      discordUserId: "user-1",
      guildId: "guild-1",
      game: Game.R6,
      teamSize: 0,
    } as never);
    expect(status.isErr() && status.error).toBe(original);

    const join = await invokeJoinQueue(client as never, joinRequest as never);
    expect(join.isErr()).toBe(true);
    if (join.isErr()) {
      expect(join.error).toBeInstanceOf(ConnectError);
      expect(join.error.message).toContain("no route");
    }
  });

  test("wraps a successful leave response", async () => {
    const client = {
      getQueueStatus: async () => ({ success: true, status: "idle" }),
      joinQueue: async () => ({ success: true, status: "waiting" }),
      leaveQueue: async () => ({ success: true }),
    };
    const result = await invokeLeaveQueue(client as never, {
      captainDiscordUserId: "user-1",
      game: Game.R6,
    } as never);
    expect(result.isOk()).toBe(true);
  });
});

