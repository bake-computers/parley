import {
  ContainerBuilder,
  TextDisplayBuilder,
  type MessageComponentInteraction,
} from "@parley/runtime";
import { Game, type LinkedIdentity, type UserSettings as ProtoUserSettings } from "@parley/proto";
import { updateV2 } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import { formatParleyRankLine } from "../../ui/parley-rank.js";
import { UI_TOKENS } from "../../ui/tokens.js";
import { getIdentityClient, type EngineTransportEnv } from "../../transport.js";
import { buildPlatformSelectCard } from "../link/ui.js";
import { invokeListMatches } from "../history/rpc.js";
import { buildHistoryCard, buildHistoryErrorCard } from "../history/ui.js";
import { invokeLookupByDiscord } from "../profile.js";
import { buildSettingsCard } from "../user/ui.js";
import type { ApplicationEmojiCatalog } from "@parley/runtime";

const GAME_NAMES: Record<number, string> = {
  [Game.R6]: "Rainbow Six Siege",
};

function gameName(game: number): string {
  return GAME_NAMES[game] ?? `Game ${game}`;
}

function formatProfileLines(
  catalog: ApplicationEmojiCatalog,
  identities: LinkedIdentity[],
): string[] {
  return identities.map((id) => {
    const rank = formatParleyRankLine(catalog, id.internalElo);
    return `**${gameName(id.game)}** — ${id.username} (${id.platform}) — ${rank}`;
  });
}

export async function resumeAfterAccept(
  interaction: MessageComponentInteraction,
  sourceCommand: string,
  settings: ProtoUserSettings,
): Promise<void> {
  const env = interaction.context.env as EngineTransportEnv;

  switch (sourceCommand) {
    case "user": {
      const emojis = await resolveEmojis(interaction);
      await updateV2(interaction, buildSettingsCard(settings, emojis));
      return;
    }
    case "link": {
      const emojis = await resolveEmojis(interaction);
      await updateV2(interaction, buildPlatformSelectCard(emojis));
      return;
    }
    case "profile": {
      if (!env.ENGINE_SERVICE_URL && !env.VPC_SERVICE) {
        await updateV2(
          interaction,
          new ContainerBuilder().addComponents(
            new TextDisplayBuilder().setContent("Engine service is not configured."),
          ),
        );
        return;
      }
      const result = await invokeLookupByDiscord(getIdentityClient(env) as never, {
        discordUserId: interaction.user?.id ?? "",
        game: Game.UNSPECIFIED,
      });
      if (result.isErr()) {
        await updateV2(
          interaction,
          new ContainerBuilder().addComponents(
            new TextDisplayBuilder().setContent(`Profile lookup failed: ${result.error.message}`),
          ),
        );
        return;
      }
      const { identities } = result.value;
      if (identities.length === 0) {
        await updateV2(
          interaction,
          new ContainerBuilder()
            .setAccentColor(UI_TOKENS.main)
            .addComponents(
              new TextDisplayBuilder().setContent("**No Linked Accounts**"),
              new TextDisplayBuilder().setContent("No accounts linked. Use /link to get started!"),
            ),
        );
        return;
      }
      const emojis = await resolveEmojis(interaction);
      const lines = formatProfileLines(emojis, identities);
      await updateV2(
        interaction,
        new ContainerBuilder()
          .setAccentColor(UI_TOKENS.main)
          .addComponents(
            new TextDisplayBuilder().setContent("**Your Linked Accounts**"),
            new TextDisplayBuilder().setContent(lines.join("\n")),
          ),
      );
      return;
    }
    case "history": {
      const guildId = interaction.guildId;
      if (!guildId) {
        await updateV2(interaction, buildHistoryErrorCard("This command can only be used in a server."));
        return;
      }
      const result = await invokeListMatches({
        env,
        guildId,
        game: Game.R6,
        limit: 5,
        cursor: "",
      });
      if (result.isOk()) {
        await updateV2(interaction, buildHistoryCard(result.value.matches, guildId));
      } else {
        await updateV2(
          interaction,
          buildHistoryErrorCard(`Could not load match history: ${result.error.message}`),
        );
      }
      return;
    }
    default: {
      const emojis = await resolveEmojis(interaction);
      await updateV2(interaction, buildSettingsCard(settings, emojis));
    }
  }
}