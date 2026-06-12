import { SlashCommand, type ChatInputCommandInteraction } from "@parley/runtime";
import { Game } from "@parley/proto";
import type { LinkedIdentity } from "@parley/proto";
import type { LookupByDiscordResponse } from "@parley/proto";
import { getIdentityClient, type EngineTransportEnv } from "../transport.js";
import { createSuccessEmbed, createInfoEmbed, createErrorEmbed } from "../embeds.js";
import type { Result } from "neverthrow";
import type { ConnectError } from "@connectrpc/connect";

const GAME_NAMES: Record<number, string> = {
  [Game.R6]: "Rainbow Six Siege",
  [Game.BRAWL_STARS]: "Brawl Stars",
};

function gameName(game: number): string {
  return GAME_NAMES[game] ?? `Game ${game}`;
}

interface IdentityClient {
  lookupByDiscord: (req: {
    discordUserId: string;
    game: number;
  }) => Promise<Result<LookupByDiscordResponse, ConnectError>>;
}

export const profileCommand = new SlashCommand()
  .setName("profile")
  .setDescription("View your linked game accounts and stats")
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply(true);

    const env = interaction.context.env as EngineTransportEnv;
    if (!env.ENGINE_SERVICE_URL && !env.VPC_SERVICE) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Configuration Error", "Engine service is not configured.")],
      });
      return;
    }

    const client = getIdentityClient(env) as unknown as IdentityClient;
    const result = await client.lookupByDiscord({
      discordUserId: interaction.user?.id ?? "",
      game: Game.UNSPECIFIED,
    });

    if (result.isErr()) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Profile Lookup Failed", result.error.message)],
      });
      return;
    }

    const { identities } = result.value;
    if (identities.length === 0) {
      await interaction.editReply({
        embeds: [
          createInfoEmbed("No Linked Accounts", "No accounts linked. Use /link to get started!"),
        ],
      });
      return;
    }

    const lines = identities.map((id: LinkedIdentity) => {
      const name = gameName(id.game);
      return `**${name}** — ${id.username} (${id.platform}) — ELO: ${Math.round(id.internalElo)}`;
    });

    await interaction.editReply({
      embeds: [createSuccessEmbed("Your Linked Accounts", lines.join("\n"))],
    });
  });
