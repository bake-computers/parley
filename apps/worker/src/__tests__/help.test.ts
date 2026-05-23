import { describe, it, expect, mock } from "bun:test";
import type { ChatInputCommandInteraction } from "@parley/runtime";

describe("helpCommand", () => {
  it("replies with an info embed listing all 4 commands ephemerally", async () => {
    const replyMock = mock<(options: unknown, forceEphemeral?: boolean) => Promise<unknown>>();
    const mockInteraction = {
      reply: replyMock,
    } as unknown as ChatInputCommandInteraction;

    // Dynamic import to ensure fresh module (no cached handlers)
    const { helpCommand } = await import("../commands/help.js");

    await helpCommand.execute(mockInteraction);

    expect(replyMock).toHaveBeenCalledTimes(1);

    const embed = replyMock.mock.calls[0]![0] as {
      embeds: Array<{
        title: string;
        color: number;
        fields: Array<{ name: string; value: string }>;
      }>;
    };

    expect(embed.embeds).toBeDefined();
    expect(embed.embeds.length).toBe(1);

    const infoEmbed = embed.embeds[0]!;
    expect(infoEmbed.title).toBe("Parley Commands");
    expect(infoEmbed.color).toBe(0xffffff);

    expect(infoEmbed.fields).toBeDefined();
    expect(infoEmbed.fields.length).toBeGreaterThanOrEqual(4);

    // Verify all 4 command names are present
    const commandNames = infoEmbed.fields.map((f) => f.name);
    expect(commandNames).toContain("/ping");
    expect(commandNames).toContain("/help");
    expect(commandNames).toContain("/link");
    expect(commandNames).toContain("/profile");
  });
});
