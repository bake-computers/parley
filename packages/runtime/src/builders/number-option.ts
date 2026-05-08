import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { NumericCommandOptionBuilder } from "./numeric-option.js";

export class SlashCommandNumberOption extends NumericCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.Number);
  }
}
