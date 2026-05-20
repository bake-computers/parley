import { type APIApplicationCommandOptionChoice } from "discord-api-types/v10";
import { BaseCommandOptionBuilder } from "./option-base.js";
import { encodeValue } from "./types.js";

export abstract class NumericCommandOptionBuilder extends BaseCommandOptionBuilder {
  setMinValue(minValue: number): this {
    this.data['min_value'] = minValue;
    return this;
  }

  setMaxValue(maxValue: number): this {
    this.data['max_value'] = maxValue;
    return this;
  }

  setAutocomplete(autocomplete = true): this {
    this.data['autocomplete'] = autocomplete;
    return this;
  }

  addChoices(...choices: APIApplicationCommandOptionChoice<number>[]): this {
    this.data['choices'] = choices.map((choice) => encodeValue(choice));
    return this;
  }
}