import { SlashCommand, logger } from "@parley/runtime";
import { Game, type LinkedIdentity } from "@parley/proto";
import { assertAccepted } from "#/interactions/_shared/acceptance.js";
import { editReplyV2 } from "#/ui/discord.js";
import { resolveEmojis } from "#/ui/emojis.js";
import { invokeLookupByDiscord } from "#/interactions/profile.js";
import { getIdentityClient, type EngineTransportEnv } from "#/transport.js";
import { buildLinkHubCard } from "#/interactions/link/ui.js";

export const linkSlashCommand = new SlashCommand()
  .setName("link")
  .setDescription("Link your Discord to your in-game account")
  .addHandler(async (interaction) => {
    const env = interaction.context.env as EngineTransportEnv;
    if (!(await assertAccepted(interaction, env as never, undefined, "link"))) {
      return;
    }
    const emojis = await resolveEmojis(interaction);

    let identities: LinkedIdentity[] = [];
    if (env.ENGINE_SERVICE_URL || env.VPC_SERVICE) {
      const lookup = await invokeLookupByDiscord(getIdentityClient(env) as never, {
        discordUserId: interaction.user?.id ?? "",
        game: Game.R6,
      });
      if (lookup.isOk()) {
        identities = lookup.value.identities;
      }
    }

    const result = await editReplyV2(interaction, buildLinkHubCard(identities, emojis));
    if (result.isErr()) {
      logger.error("link.hub_failed", "Failed to send link hub", {
        error: result.error,
        interactionId: interaction.id,
      });
    }
  });
