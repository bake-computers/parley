import {
  ActionRowBuilder,
  ModalBuilder,
  ModalHandler,
  TextInputBuilder,
  logger,
  parseCustomId,
} from "@parley/runtime";
import { updateV2 } from "#/utils/discord";
import {
  GAME_NAME,
  TextInputStyle,
  USERNAME_INPUT_ID,
  USERNAME_MODAL_PREFIX,
  isPlatform,
  platformLabel,
  usernameModalCustomId,
  type Platform,
} from "#/interactions/link/constants";
import { buildConfirmCard } from "#/interactions/link/ui";

/**
 * Step 2: collect the in-game username via a modal, then update the wizard
 * message into the confirm card.
 *
 * The platform is encoded in the modal's customId (`link-username-modal/{platform}`)
 * so we know which platform the user picked without extra state.
 */
export const usernameModalHandler = new ModalHandler(USERNAME_MODAL_PREFIX).addHandler(
  async (interaction) => {
    const parsed = parseCustomId(interaction.customId);
    if (typeof parsed === "string") {
      await interaction.reply("This form is no longer available.", true);
      return;
    }
    const platformValue = parsed.path[1];
    if (!platformValue || !isPlatform(platformValue)) {
      logger.error(
        "link.modal.invalid_platform",
        "Username modal submitted with unknown platform",
        {
          interactionId: interaction.id,
          customId: interaction.customId,
          platform: platformValue,
        },
      );
      await interaction.reply("This form is no longer available.", true);
      return;
    }

    const username = interaction.fields.getString(USERNAME_INPUT_ID)?.trim() ?? "";
    if (!username) {
      await interaction.reply("Please enter your in-game username to link your account.", true);
      return;
    }

    const result = await updateV2(interaction, buildConfirmCard(platformValue, username));
    if (result.isErr()) {
      logger.error("link.modal.update_failed", "Failed to render confirm card after modal submit", {
        interactionId: interaction.id,
        error: result.error,
      });
    }
  },
);

/**
 * Builds the modal shown after a platform button is clicked. The platform is
 * baked into the modal's customId so the {@link usernameModalHandler} above can
 * read it on submit.
 *
 * @param {Platform} platform - The platform the user picked.
 * @returns {ModalBuilder} A modal with a single username TextInput.
 */
export function buildUsernameModal(platform: Platform): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(usernameModalCustomId(platform))
    .setTitle(`Link your ${GAME_NAME} account`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(USERNAME_INPUT_ID)
          .setLabel("In-game username")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(64)
          .setPlaceholder(`Your ${GAME_NAME} username on ${platformLabel(platform)}`),
      ),
    );
}
