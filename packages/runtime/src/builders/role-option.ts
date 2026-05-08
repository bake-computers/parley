import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { BaseCommandOptionBuilder } from "./option-base.js";

export class SlashCommandRoleOption extends BaseCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.Role);
  }
}
