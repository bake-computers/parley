import { SlashCommand } from "@parley/runtime";
import type { LinkAccountResponse } from "@parley/proto/identity/v1/identity_pb.js";
import { Game } from "@parley/proto";
import type { ConnectError } from "@connectrpc/connect";
import type { Result } from "neverthrow";
import { getIdentityClient } from "../transport.js";
import { createSuccessEmbed, createErrorEmbed } from "../embeds.js";

type IdentityClient = {
  linkAccount(req: {
    discordUserId: string;
    game: number;
    username: string;
    platform: string;
    guildId?: string;
  }): Promise<Result<LinkAccountResponse, ConnectError>>;
};

export const linkCommand = new SlashCommand()
  .setName("link")
  .setDescription("Link your Discord account to your game account")
  .addStringOption((option) =>
    option.setName("username").setDescription("Your in-game username").setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("platform")
      .setDescription("Your platform")
      .setRequired(true)
      .addChoices(
        { name: "PC", value: "pc" },
        { name: "Xbox", value: "xbox" },
        { name: "PlayStation", value: "playstation" },
      ),
  )
  .addHandler(async (interaction) => {
    if (!interaction.user) {
      await interaction.deferReply(true);
      const embed = createErrorEmbed("Link Failed", "Could not identify Discord user.");
      await interaction.editReply({ embeds: [embed.toJSON()] });
      return;
    }

    const username = interaction.options.getString("username", true)!;
    const platform = interaction.options.getString("platform", true)!;
    const discordUserId = interaction.user.id;

    await interaction.deferReply(true);

    const env = interaction.context.env as Record<string, string>;
    const engineServiceUrl = env["ENGINE_SERVICE_URL"];
    if (!engineServiceUrl) {
      const embed = createErrorEmbed("Link Failed", "Engine service URL is not configured.");
      await interaction.editReply({ embeds: [embed.toJSON()] });
      return;
    }

    const identityClient = getIdentityClient(engineServiceUrl) as unknown as IdentityClient;

    const guildId = interaction.guildId ?? undefined;

    const result = await identityClient.linkAccount({
      discordUserId,
      game: Game.R6,
      username,
      platform,
      ...(guildId !== undefined ? { guildId } : {}),
    });

    if (result.isOk()) {
      const response = result.value;
      const embed = createSuccessEmbed(
        "Account Linked",
        `Successfully linked account!\n\n**Username:** ${response.usernameNormalized}\n**Player ID:** ${response.playerId}\n**Platform:** ${platform}`,
      );
      await interaction.editReply({ embeds: [embed.toJSON()] });
    } else {
      const error = result.error;
      const embed = createErrorEmbed(
        "Link Failed",
        `Could not link your account: ${error.message}`,
      );
      await interaction.editReply({ embeds: [embed.toJSON()] });
    }
  });
