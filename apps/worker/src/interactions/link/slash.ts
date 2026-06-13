import { SlashCommand, logger } from "@parley/runtime";
import { replyV2 } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import { buildPlatformSelectCard } from "./ui.js";

export const linkSlashCommand = new SlashCommand()
  .setName("link")
  .setDescription("Link your Discord to your in-game account")
  .addHandler(async (interaction) => {
    const emojis = await resolveEmojis(interaction);
    const result = await replyV2(interaction, buildPlatformSelectCard(emojis), true);
    if (result.isErr()) {
      logger.error("link.platform_select_failed", "Failed to send platform select", {
        error: result.error,
        interactionId: interaction.id,
      });
    }
  });
