import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { BaseCommandOptionBuilder } from "./option-base.js";

export class SlashCommandBooleanOption extends BaseCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.Boolean);
  }
}
