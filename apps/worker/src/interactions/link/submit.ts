import {
  logger,
  ModalHandler,
  parseCustomId,
  type ApplicationEmojiCatalog,
  type ContainerBuilder,
  type ModalInteraction,
} from "@parley/runtime";
import { updateReplyV2 } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import { isPlatform } from "./constants.js";
import { buildConfirmCard, buildErrorCard } from "./ui.js";

async function respondToModal(
  interaction: ModalInteraction,
  build: (emojis: ApplicationEmojiCatalog) => ContainerBuilder,
): Promise<void> {
  const emojis = await resolveEmojis(interaction);
  const container = build(emojis);

  // Modal submit must ACK with UPDATE_MESSAGE (type 7) — same as deferUpdate+edit on
  // buttons, but in one step. deferReply (type 5) creates a new ephemeral message and
  // breaks CV2 wizard flows (Discord shows "Something went wrong" in the modal).
  const updateResult = await updateReplyV2(interaction, container);
  if (updateResult.isOk()) {
    logger.info("discord.link.modal_submit", "Modal submit updated link wizard", {
      interactionId: interaction.id,
      customId: interaction.customId,
    });
    return;
  }

  logger.error("link.modal.update_failed", "Modal submit failed to update wizard", {
    interactionId: interaction.id,
    customId: interaction.customId,
    error: updateResult.error,
  });

  const fallback = await interaction.update(
    "Could not show the confirmation card. Run `/link` to try again.",
  );
  if (fallback.isErr()) {
    logger.error("link.modal.fallback_failed", "Modal submit fallback update failed", {
      interactionId: interaction.id,
      customId: interaction.customId,
      error: fallback.error,
    });
  }
}

export const linkSubmitModal = new ModalHandler("link").addHandler(async (interaction) => {
  const parsed = parseCustomId(interaction.customId);
  if (typeof parsed === "string") {
    await respondToModal(interaction, (emojis) => buildErrorCard("Invalid modal.", emojis));
    return;
  }

  const platformValue = parsed.path[2];
  if (!platformValue || !isPlatform(platformValue)) {
    await respondToModal(interaction, (emojis) => buildErrorCard("Invalid platform.", emojis));
    return;
  }

  let username: string | null;
  try {
    username = interaction.fields.getString("username", true);
  } catch {
    await respondToModal(interaction, (emojis) => buildErrorCard("Username is required.", emojis));
    return;
  }

  if (!username) {
    await respondToModal(interaction, (emojis) => buildErrorCard("Username is required.", emojis));
    return;
  }

  try {
    await respondToModal(interaction, (emojis) =>
      buildConfirmCard(platformValue, username, emojis),
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("too long")
        ? "Username is too long."
        : "Could not show confirmation.";
    await respondToModal(interaction, (emojis) => buildErrorCard(message, emojis));
  }
});