import { ModalBuilder, TextInputBuilder, TextDisplayBuilder } from "@parley/runtime";
import { TextInputStyle } from "discord-api-types/v10";
import { USER_DELETE_MODAL } from "./constants.js";

export function buildDeleteConfirmModal(
  expectedUsername: string,
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(USER_DELETE_MODAL)
    .setTitle("Delete your data?")
    .addComponents(
      new TextDisplayBuilder().setContent(
        "This will anonymize all your linked accounts, match history, and tournament data. You will not be able to re-link for 30 days.",
      ),
      new TextInputBuilder()
        .setCustomId("user/delete-confirm-input")
        .setLabel(`Type "${expectedUsername}" to confirm`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(64),
    );
}
