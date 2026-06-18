import { SlashCommand, logger } from "@parley/runtime";
import { Game } from "@parley/proto";
import { assertAccepted } from "../_shared/acceptance.js";
import { editReplyV2 } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import { invokeLookupByDiscord } from "../profile.js";
import { getIdentityClient, type EngineTransportEnv } from "../../transport.js";
import { buildAlreadyLinkedCard, buildPlatformSelectCard } from "./ui.js";

export const linkSlashCommand = new SlashCommand()
  .setName("link")
  .setDescription("Link your Discord to your in-game account")
  .addHandler(async (interaction) => {
    const env = interaction.context.env as EngineTransportEnv;
    if (!(await assertAccepted(interaction, env as never, undefined, "link"))) {
      return;
    }
    const emojis = await resolveEmojis(interaction);

    if (env.ENGINE_SERVICE_URL || env.VPC_SERVICE) {
      const lookup = await invokeLookupByDiscord(getIdentityClient(env) as never, {
        discordUserId: interaction.user?.id ?? "",
        game: Game.R6,
      });
      if (lookup.isOk() && lookup.value.identities.length > 0) {
        const result = await editReplyV2(
          interaction,
          buildAlreadyLinkedCard(lookup.value.identities[0]!, emojis),
        );
        if (result.isErr()) {
          logger.error("link.already_linked_failed", "Failed to send already-linked card", {
            error: result.error,
            interactionId: interaction.id,
          });
        }
        return;
      }
    }

    const result = await editReplyV2(interaction, buildPlatformSelectCard(emojis));
    if (result.isErr()) {
      logger.error("link.platform_select_failed", "Failed to send platform select", {
        error: result.error,
        interactionId: interaction.id,
      });
    }
  });
