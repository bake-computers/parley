import { describe, expect, test } from "bun:test";
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { EmbedBuilder, SlashCommand } from ".";
import { CommandInteractionOptionResolver } from "./handlers";
import { registerApplicationCommandsWithOptions } from "./register";
import { verifyDiscordRequest } from "./verify";

describe("local discord runtime", () => {
  test("SlashCommand serializes string choices", () => {
    const command = new SlashCommand()
      .setName("stats")
      .setDescription("Show stats")
      .addStringOption((option) =>
        option
          .setName("platform")
          .setDescription("Platform")
          .setRequired(false)
          .addChoices({ name: "PC", value: "pc" }, { name: "Xbox", value: "xbox" }),
      );

    expect(command.toJSON()).toEqual({
      name: "stats",
      description: "Show stats",
      type: 1,
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: "platform",
          description: "Platform",
          required: false,
          choices: [
            { name: "PC", value: "pc" },
            { name: "Xbox", value: "xbox" },
          ],
        },
      ],
    });
  });

  test("EmbedBuilder serializes embed data", () => {
    const embed = new EmbedBuilder()
      .setColor(0x123456)
      .setTitle("Title")
      .setDescription("Description")
      .addFields({ name: "Field", value: "Value", inline: true })
      .setFooter({ text: "Footer" })
      .toJSON();

    expect(embed).toEqual({
      color: 0x123456,
      title: "Title",
      description: "Description",
      fields: [{ name: "Field", value: "Value", inline: true }],
      footer: { text: "Footer" },
    });
  });

  test("option resolver handles required and optional values", () => {
    const resolver = new CommandInteractionOptionResolver(
      [
        {
          name: "username",
          type: ApplicationCommandOptionType.String,
          value: "player",
        },
      ],
      undefined,
    );

    expect(resolver.getString("username", true)).toBe("player");
    expect(resolver.getString("missing", false)).toBeNull();
    expect(() => resolver.getString("missing", true)).toThrow("Option not found");
  });

  test("verifyDiscordRequest rejects invalid requests", async () => {
    const request = new Request("https://example.com/interactions", {
      method: "POST",
      body: "{}",
    });

    expect((await verifyDiscordRequest(request, undefined)).isErr()).toBe(true);
    expect((await verifyDiscordRequest(request, "abcd")).isErr()).toBe(true);
  });

  test("registerApplicationCommands succeeds with injected fetch", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await registerApplicationCommandsWithOptions(
      "token",
      "app",
      { fetcher, apiBaseUrl: "https://discord.test/api/v10" },
      new SlashCommand().setName("ping").setDescription("Ping"),
    );

    expect(result.isOk()).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://discord.test/api/v10/applications/app/commands");
    expect(calls[0]?.body).toEqual([{ name: "ping", description: "Ping", type: 1 }]);
  });

  test("registerApplicationCommands reports missing credentials", async () => {
    const result = await registerApplicationCommandsWithOptions(undefined, "app", {});
    expect(result.isErr()).toBe(true);
  });

  test("registerApplicationCommands reports Discord errors", async () => {
    const fetcher = (async () => new Response("bad", { status: 500 })) as unknown as typeof fetch;
    const result = await registerApplicationCommandsWithOptions(
      "token",
      "app",
      { fetcher, apiBaseUrl: "https://discord.test/api/v10" },
      new SlashCommand().setName("ping").setDescription("Ping"),
    );
    expect(result.isErr()).toBe(true);
  });
});
