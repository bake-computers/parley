import {
  ContainerBuilder,
  SlashCommand,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
} from "@parley/runtime";
import { Game } from "@parley/proto";
import type { LinkedIdentity } from "@parley/proto";
import type { LookupByDiscordResponse } from "@parley/proto";
import { assertAccepted } from "./_shared/acceptance.js";
import { getIdentityClient, type EngineTransportEnv } from "../transport.js";
import { editReplyV2 } from "../ui/discord.js";
import { UI_TOKENS } from "../ui/tokens.js";
import type { Result } from "neverthrow";
import type { ConnectError } from "@connectrpc/connect";

const GAME_NAMES: Record<number, string> = {
  [Game.R6]: "Rainbow Six Siege",
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
    const env = interaction.context.env as EngineTransportEnv;
    if (!(await assertAccepted(interaction, env as never))) {
      return;
    }

    await interaction.deferReply(true);

    if (!env.ENGINE_SERVICE_URL && !env.VPC_SERVICE) {
      await interaction.editReply({
        embeds: [
          {
            title: "Configuration Error",
            description: "Engine service is not configured.",
            color: UI_TOKENS.error,
          },
        ],
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
        embeds: [
          {
            title: "Profile Lookup Failed",
            description: result.error.message,
            color: UI_TOKENS.error,
          },
        ],
      });
      return;
    }

    const { identities } = result.value;
    if (identities.length === 0) {
      const container = new ContainerBuilder()
        .setAccentColor(UI_TOKENS.main)
        .addComponents(
          new TextDisplayBuilder().setContent("**No Linked Accounts**"),
          new TextDisplayBuilder().setContent("No accounts linked. Use /link to get started!"),
        );
      await editReplyV2(interaction, container);
      return;
    }

    const lines = identities.map(
      (id: LinkedIdentity) =>
        `**${gameName(id.game)}** — ${id.username} (${id.platform}) — ELO: ${Math.round(id.internalElo)}`,
    );
    const container = new ContainerBuilder()
      .setAccentColor(UI_TOKENS.main)
      .addComponents(
        new TextDisplayBuilder().setContent("**Your Linked Accounts**"),
        new TextDisplayBuilder().setContent(lines.join("\n")),
      );
    await editReplyV2(interaction, container);
  });
