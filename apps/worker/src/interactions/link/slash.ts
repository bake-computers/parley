import { SlashCommand, logger } from "@parley/runtime";
import { assertAccepted } from "../_shared/acceptance.js";
import { replyV2 } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import { buildPlatformSelectCard } from "./ui.js";
import type { EngineTransportEnv } from "../../transport.js";

export const linkSlashCommand = new SlashCommand()
  .setName("link")
  .setDescription("Link your Discord to your in-game account")
  .addHandler(async (interaction) => {
    const env = interaction.context.env as EngineTransportEnv;
    if (!(await assertAccepted(interaction, env as never))) {
      return;
    }
    const emojis = await resolveEmojis(interaction);
    const result = await replyV2(interaction, buildPlatformSelectCard(emojis), true);
    if (result.isErr()) {
      logger.error("link.platform_select_failed", "Failed to send platform select", {
        error: result.error,
        interactionId: interaction.id,
      });
    }
  });
