import {
  ContainerBuilder,
  err,
  ok,
  SlashCommand,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
  type Result,
} from "@parley/runtime";
import { Game } from "@parley/proto";
import type { LinkedIdentity } from "@parley/proto";
import type { LookupByDiscordResponse } from "@parley/proto";
import { ConnectError } from "@connectrpc/connect";
import { cacheDiscordProfileFromUser } from "#/interactions/profile-cache";
import { getIdentityClient, type EngineTransportEnv } from "#/transport";
import { editReplyV2 } from "#/utils/discord";
import { formatParleyRankLine } from "#/utils/parley-rank";
import { ColorPalette } from "#/utils/constants";

const GAME_NAMES: Record<number, string> = {
  [Game.R6]: "Rainbow Six Siege",
};

function gameName(game: number): string {
  return GAME_NAMES[game] ?? `Game ${game}`;
}

function formatLinkedIdentityLines(identities: LinkedIdentity[]): string[] {
  return identities.map((id) => {
    const rank = formatParleyRankLine(id.internalElo);
    return `**${gameName(id.game)}** — ${id.username} (${id.platform}) — ${rank}`;
  });
}

interface IdentityClient {
  lookupByDiscord: (req: {
    discordUserId: string;
    game: number;
  }) => Promise<LookupByDiscordResponse>;
}

export function invokeLookupByDiscord(
  client: IdentityClient,
  req: { discordUserId: string; game: number },
): Promise<Result<LookupByDiscordResponse, ConnectError>> {
  return client.lookupByDiscord(req).then(
    (response) => ok(response),
    (cause: unknown) =>
      err(cause instanceof ConnectError ? cause : new ConnectError(String(cause), 13, {})),
  );
}

export const profileCommand = new SlashCommand()
  .setName("profile")
  .setDescription("View your linked game accounts and stats")
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    const env = interaction.context.env as EngineTransportEnv;

    if (!env.ENGINE_INTERNAL_URL && !env.VPC_SERVICE) {
      await interaction.editReply({
        embeds: [
          {
            title: "Configuration Error",
            description: "Engine service is not configured.",
            color: ColorPalette.error,
          },
        ],
      });
      return;
    }

    // Refresh public web profile handle cache whenever they open /profile.
    void cacheDiscordProfileFromUser(env, interaction.user);

    const client = getIdentityClient(env) as unknown as IdentityClient;
    const result = await invokeLookupByDiscord(client, {
      discordUserId: interaction.user?.id ?? "",
      game: Game.UNSPECIFIED,
    });

    if (result.isErr()) {
      await interaction.editReply({
        embeds: [
          {
            title: "Profile Lookup Failed",
            description: result.error.message,
            color: ColorPalette.error,
          },
        ],
      });
      return;
    }

    const { identities } = result.value;
    if (identities.length === 0) {
      const container = new ContainerBuilder()
        .setAccentColor(ColorPalette.main)
        .addComponents(
          new TextDisplayBuilder().setContent("**No Linked Accounts**"),
          new TextDisplayBuilder().setContent("No accounts linked. Use /link to get started!"),
        );
      await editReplyV2(interaction, container);
      return;
    }

    const lines = formatLinkedIdentityLines(identities);
    const container = new ContainerBuilder()
      .setAccentColor(ColorPalette.main)
      .addComponents(
        new TextDisplayBuilder().setContent("**Your Linked Accounts**"),
        new TextDisplayBuilder().setContent(lines.join("\n")),
      );
    await editReplyV2(interaction, container);
  });
