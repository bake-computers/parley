import { ActionRowBuilder, ModalBuilder, TextInputBuilder } from "@parley/runtime";
import { TextInputStyle } from "discord-api-types/v10";
import { USER_DELETE_MODAL } from "./constants.js";

export function buildDeleteConfirmModal(expectedUsername: string): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId("user/delete-confirm-input")
    .setLabel(`Type "${expectedUsername}" to confirm (30-day re-link cooldown)`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(64);

  return new ModalBuilder()
    .setCustomId(USER_DELETE_MODAL)
    .setTitle("Delete your data?")
    .addComponents(new ActionRowBuilder().addComponents(input));
}
