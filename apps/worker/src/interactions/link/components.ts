import {
  ActionRowBuilder,
  ComponentHandler,
  logger,
  ModalBuilder,
  parseCustomId,
  TextInputBuilder,
} from "@parley/runtime";

const COMPONENT_BUTTON = 2;
const TEXT_INPUT_SHORT = 1;
import { editReplyV2, readMessageIdFromEditResult } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import { isPlatform, type Platform } from "./constants.js";
import {
  parseWizardMessageIdFromPath,
  withWizardMessageSegment,
} from "./wizard-message.js";
import { executeLinkAccount } from "./rpc.js";
import {
  buildErrorCard,
  buildPlatformSelectCard,
  buildSuccessCard,
  buildUsernamePromptCard,
} from "./ui.js";

function parseLinkPath(customId: string): { action: string; segments: string[] } | null {
  const parsed = parseCustomId(customId);
  if (typeof parsed === "string") {
    return null;
  }

  const [, action, ...segments] = parsed.path;
  if (!action) {
    return null;
  }

  return { action, segments };
}

function parseConfirmPlatformAndUsername(
  customId: string,
): { platform: Platform; username: string } | null {
  const parsed = parseCustomId(customId);
  if (typeof parsed === "string") {
    return null;
  }

  const platformValue = parsed.path[2];
  if (!platformValue || !isPlatform(platformValue)) {
    return null;
  }

  const username = parsed.params.get("username");
  if (!username) {
    return null;
  }

  return { platform: platformValue, username };
}

export const linkButtonHandler = new ComponentHandler("link", COMPONENT_BUTTON).addHandler(
  async (interaction) => {
    const route = parseLinkPath(interaction.customId);
    if (!route) {
      await interaction.deferReply(true);
      const emojis = await resolveEmojis(interaction);
      await editReplyV2(interaction, buildErrorCard("Invalid interaction.", emojis));
      return;
    }

    const emojis = await resolveEmojis(interaction);

    switch (route.action) {
      case "platform": {
        const platformValue = route.segments[0];
        if (!platformValue || !isPlatform(platformValue)) {
          await interaction.deferReply(true);
          await editReplyV2(interaction, buildErrorCard("Invalid platform.", emojis));
          return;
        }

        const hintedMessageId = interaction.messageId;
        await interaction.deferUpdate();
        const editResult = await editReplyV2(
          interaction,
          buildUsernamePromptCard(platformValue, emojis, hintedMessageId),
        );
        const wizardMessageId = hintedMessageId ?? readMessageIdFromEditResult(editResult);

        if (wizardMessageId && wizardMessageId !== hintedMessageId) {
          await editReplyV2(
            interaction,
            buildUsernamePromptCard(platformValue, emojis, wizardMessageId),
          );
        }

        logger.info("discord.link.platform_selected", "Link wizard advanced to username step", {
          interactionId: interaction.id,
          customId: interaction.customId,
          wizardMessageId: wizardMessageId ?? "unknown",
        });
        return;
      }

      case "username": {
        const platformValue = route.segments[0];
        if (!platformValue || !isPlatform(platformValue)) {
          await interaction.deferReply(true);
          await editReplyV2(interaction, buildErrorCard("Invalid platform.", emojis));
          return;
        }

        const wizardMessageId =
          interaction.messageId ?? parseWizardMessageIdFromPath(route.segments, 1);

        const modalCustomId = wizardMessageId
          ? withWizardMessageSegment(`link/submit/${platformValue}`, wizardMessageId)
          : `link/submit/${platformValue}`;

        logger.info("discord.link.modal_open", "Opening link username modal", {
          interactionId: interaction.id,
          customId: modalCustomId,
          wizardMessageId: wizardMessageId ?? "none",
        });

        await interaction.showModal(
          new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle("Link Account")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("username")
                  .setLabel("In-game Username")
                  .setStyle(TEXT_INPUT_SHORT)
                  .setRequired(true)
                  .setMinLength(3)
                  .setMaxLength(24)
                  .setPlaceholder("Your R6 username"),
              ),
            ),
        );
        return;
      }

      case "confirm": {
        if (!interaction.user) {
          await interaction.deferReply(true);
          await editReplyV2(
            interaction,
            buildErrorCard("Could not identify Discord user.", emojis),
          );
          return;
        }

        const confirmData = parseConfirmPlatformAndUsername(interaction.customId);
        if (!confirmData) {
          await interaction.deferReply(true);
          await editReplyV2(interaction, buildErrorCard("Invalid confirmation data.", emojis));
          return;
        }

        await interaction.deferReply(true);

        const result = await executeLinkAccount(
          interaction,
          confirmData.platform,
          confirmData.username,
        );

        if (result.isErr()) {
          await editReplyV2(interaction, buildErrorCard(result.error.message, emojis));
          return;
        }

        const response = result.value;
        if (!response.success) {
          const message = response.error?.message ?? "Could not link your account.";
          await editReplyV2(interaction, buildErrorCard(message, emojis));
          return;
        }

        await editReplyV2(
          interaction,
          buildSuccessCard(
            response.usernameNormalized,
            response.playerId,
            confirmData.platform,
            emojis,
          ),
        );
        return;
      }

      case "cancel": {
        await interaction.deferUpdate();
        await editReplyV2(interaction, buildPlatformSelectCard(emojis));
        return;
      }

      default: {
        await interaction.deferReply(true);
        await editReplyV2(interaction, buildErrorCard("Unknown action.", emojis));
      }
    }
  },
);
