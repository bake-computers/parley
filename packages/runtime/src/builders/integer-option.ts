import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { NumericCommandOptionBuilder } from "./numeric-option.js";

export class SlashCommandIntegerOption extends NumericCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.Integer);
  }
}
