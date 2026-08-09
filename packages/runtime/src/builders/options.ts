import {
  ApplicationCommandOptionType,
  ChannelType,
  type APIApplicationCommandOptionChoice,
} from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import { encodeValue, type JSONEncodable } from "./types.js";

export abstract class BaseCommandOptionBuilder implements JSONEncodable<JsonObject> {
  protected data: JsonObject;

  protected constructor(type: ApplicationCommandOptionType) {
    this.data = { type };
  }

  setName(name: string): this {
    this.data["name"] = name;
    return this;
  }

  setDescription(description: string): this {
    this.data["description"] = description;
    return this;
  }

  setRequired(required = true): this {
    this.data["required"] = required;
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}

export abstract class NumericCommandOptionBuilder extends BaseCommandOptionBuilder {
  setMinValue(minValue: number): this {
    this.data["min_value"] = minValue;
    return this;
  }

  setMaxValue(maxValue: number): this {
    this.data["max_value"] = maxValue;
    return this;
  }

  setAutocomplete(autocomplete = true): this {
    this.data["autocomplete"] = autocomplete;
    return this;
  }

  addChoices(...choices: APIApplicationCommandOptionChoice<number>[]): this {
    this.data["choices"] = choices.map((choice) => encodeValue(choice));
    return this;
  }
}

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

export class SlashCommandIntegerOption extends NumericCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.Integer);
  }
}

export class SlashCommandNumberOption extends NumericCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.Number);
  }
}

export class SlashCommandBooleanOption extends BaseCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.Boolean);
  }
}

export class SlashCommandUserOption extends BaseCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.User);
  }
}

export class SlashCommandRoleOption extends BaseCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.Role);
  }
}

export class SlashCommandMentionableOption extends BaseCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.Mentionable);
  }
}

export class SlashCommandAttachmentOption extends BaseCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.Attachment);
  }
}

export class SlashCommandChannelOption extends BaseCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.Channel);
  }

  addChannelTypes(...channelTypes: ChannelType[]): this {
    this.data["channel_types"] = channelTypes;
    return this;
  }
}
