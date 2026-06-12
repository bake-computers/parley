import { describe, it, expect, mock } from "bun:test";
import type { ChatInputCommandInteraction } from "@parley/runtime";

describe("pingCommand", () => {
  it("replies with Pong! 🏓 ephemerally", async () => {
    const replyMock = mock<(content: string, forceEphemeral?: boolean) => Promise<unknown>>();
    const mockInteraction = {
      reply: replyMock,
    } as unknown as ChatInputCommandInteraction;

    // Dynamic import to ensure fresh module (no cached handlers)
    const { pingCommand } = await import("../interactions/ping.js");

    await pingCommand.execute(mockInteraction);

    expect(replyMock).toHaveBeenCalledWith("Pong! 🏓", true);
  });
});
