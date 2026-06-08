import {
  ApplicationCommandOptionType,
  type APIApplicationCommandOptionChoice,
} from "discord-api-types/v10";
import { BaseCommandOptionBuilder } from "./option-base.js";
import { encodeValue } from "./types.js";

export class SlashCommandStringOption extends BaseCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.String);
  }

  setMinLength(minLength: number): this {
    this.data["min_length"] = minLength;
    return this;
  }

  setMaxLength(maxLength: number): this {
    this.data["max_length"] = maxLength;
    return this;
  }

  setAutocomplete(autocomplete = true): this {
    this.data["autocomplete"] = autocomplete;
    return this;
  }

  addChoices(...choices: APIApplicationCommandOptionChoice<string>[]): this {
    this.data["choices"] = choices.map((choice) => encodeValue(choice));
    return this;
  }
}
