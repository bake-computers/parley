import { ActionRowBuilder, ModalBuilder, TextInputBuilder } from "@parley/runtime";
import { TextInputStyle } from "discord-api-types/v10";
import { USER_DELETE_MODAL } from "#/interactions/user/constants";

export const USER_DELETE_CONFIRM_INPUT = "user/delete-confirm-input";

export function buildDeleteConfirmModal(expectedUsername: string): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(USER_DELETE_CONFIRM_INPUT)
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
