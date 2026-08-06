import {
  ContainerBuilder,
  SlashCommand,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
} from "@parley/runtime";
import { Game } from "@parley/proto";
import type { LinkedIdentity } from "@parley/proto";
import type { LookupByDiscordResponse } from "@parley/proto";
import { ConnectError } from "@connectrpc/connect";
import { err, ok, type Result } from "neverthrow";
import { getIdentityClient, type EngineTransportEnv } from "#/transport";
import { editReplyV2 } from "#/ui/discord";
import { resolveEmojis } from "#/ui/emojis";
import { formatParleyRankLine } from "#/ui/parley-rank";
import { UI_TOKENS } from "#/ui/tokens";
import type { ApplicationEmojiCatalog } from "@parley/runtime";

const GAME_NAMES: Record<number, string> = {
  [Game.R6]: "Rainbow Six Siege",
};

function gameName(game: number): string {
  return GAME_NAMES[game] ?? `Game ${game}`;
}

function formatLinkedIdentityLines(
  catalog: ApplicationEmojiCatalog,
  identities: LinkedIdentity[],
): string[] {
  return identities.map((id) => {
    const rank = formatParleyRankLine(catalog, id.internalElo);
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

    const emojis = await resolveEmojis(interaction);
    const lines = formatLinkedIdentityLines(emojis, identities);
    const container = new ContainerBuilder()
      .setAccentColor(UI_TOKENS.main)
      .addComponents(
        new TextDisplayBuilder().setContent("**Your Linked Accounts**"),
        new TextDisplayBuilder().setContent(lines.join("\n")),
      );
    await editReplyV2(interaction, container);
  });
