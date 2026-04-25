import {
  ApplicationCommandOptionType,
  ButtonStyle,
  ChannelType,
  ComponentType,
  TextInputStyle,
  type APIApplicationCommandOptionChoice,
  type APIEmbed,
  type APIEmbedField,
} from "discord-api-types/v10";
import type { JsonObject, JsonValue } from "./types";

export interface JSONEncodable<T extends JsonValue = JsonObject> {
  toJSON(): T;
}

function encodeValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => encodeValue(item));
  }

  if (isJSONEncodable(value)) {
    return value.toJSON();
  }

  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encodeValue(item)]),
    ) as JsonObject;
  }

  return null;
}

export function isJSONEncodable(value: unknown): value is JSONEncodable {
  return (
    typeof value === "object" &&
    value !== null &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  );
}

export function resolveJson<T extends JsonValue>(value: T | JSONEncodable<T>): T {
  return isJSONEncodable(value) ? (value.toJSON() as T) : (value as T);
}

export class EmbedBuilder implements JSONEncodable<APIEmbed & JsonObject> {
  private data: APIEmbed & JsonObject = {};

  constructor(data: APIEmbed = {}) {
    this.data = { ...(data as APIEmbed & JsonObject) };
  }

  setTitle(title: string): this {
    this.data.title = title;
    return this;
  }

  setDescription(description: string): this {
    this.data.description = description;
    return this;
  }

  setColor(color: number): this {
    this.data.color = color;
    return this;
  }

  setURL(url: string): this {
    this.data.url = url;
    return this;
  }

  setTimestamp(timestamp: Date | string | number = new Date()): this {
    this.data.timestamp =
      timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
    return this;
  }

  setFooter(footer: { text: string; icon_url?: string }): this {
    this.data.footer = footer;
    return this;
  }

  addFields(...fields: APIEmbedField[]): this {
    this.data.fields = [...(this.data.fields ?? []), ...fields];
    return this;
  }

  toJSON(): APIEmbed & JsonObject {
    return { ...this.data };
  }
}

export class ActionRowBuilder<
  Component extends JSONEncodable = JSONEncodable,
> implements JSONEncodable<JsonObject> {
  private components: Component[] = [];

  addComponents(...components: Component[]): this {
    this.components.push(...components);
    return this;
  }

  toJSON(): JsonObject {
    return {
      type: ComponentType.ActionRow,
      components: this.components.map((component) => component.toJSON()),
    };
  }
}

export class ButtonBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    type: ComponentType.Button,
  };

  setCustomId(customId: string): this {
    this.data.custom_id = customId;
    return this;
  }

  setLabel(label: string): this {
    this.data.label = label;
    return this;
  }

  setStyle(style: ButtonStyle): this {
    this.data.style = style;
    return this;
  }

  setURL(url: string): this {
    this.data.url = url;
    return this;
  }

  setDisabled(disabled = true): this {
    this.data.disabled = disabled;
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}

export class StringSelectMenuOptionBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {};

  setLabel(label: string): this {
    this.data.label = label;
    return this;
  }

  setValue(value: string): this {
    this.data.value = value;
    return this;
  }

  setDescription(description: string): this {
    this.data.description = description;
    return this;
  }

  setDefault(isDefault = true): this {
    this.data.default = isDefault;
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}

export class StringSelectMenuBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    type: ComponentType.StringSelect,
    options: [],
  };

  setCustomId(customId: string): this {
    this.data.custom_id = customId;
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.data.placeholder = placeholder;
    return this;
  }

  setMinValues(minValues: number): this {
    this.data.min_values = minValues;
    return this;
  }

  setMaxValues(maxValues: number): this {
    this.data.max_values = maxValues;
    return this;
  }

  setDisabled(disabled = true): this {
    this.data.disabled = disabled;
    return this;
  }

  addOptions(...options: StringSelectMenuOptionBuilder[]): this {
    const current = Array.isArray(this.data.options) ? this.data.options : [];
    this.data.options = [...current, ...options.map((option) => option.toJSON())];
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}

export class TextInputBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    type: ComponentType.TextInput,
  };

  setCustomId(customId: string): this {
    this.data.custom_id = customId;
    return this;
  }

  setLabel(label: string): this {
    this.data.label = label;
    return this;
  }

  setStyle(style: TextInputStyle): this {
    this.data.style = style;
    return this;
  }

  setRequired(required = true): this {
    this.data.required = required;
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.data.placeholder = placeholder;
    return this;
  }

  setMinLength(minLength: number): this {
    this.data.min_length = minLength;
    return this;
  }

  setMaxLength(maxLength: number): this {
    this.data.max_length = maxLength;
    return this;
  }

  setValue(value: string): this {
    this.data.value = value;
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}

export class ModalBuilder implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    components: [],
  };

  setCustomId(customId: string): this {
    this.data.custom_id = customId;
    return this;
  }

  setTitle(title: string): this {
    this.data.title = title;
    return this;
  }

  addComponents(...components: ActionRowBuilder[]): this {
    const current = Array.isArray(this.data.components) ? this.data.components : [];
    this.data.components = [...current, ...components.map((component) => component.toJSON())];
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}

abstract class BaseCommandOptionBuilder implements JSONEncodable<JsonObject> {
  protected data: JsonObject;

  protected constructor(type: ApplicationCommandOptionType) {
    this.data = { type };
  }

  setName(name: string): this {
    this.data.name = name;
    return this;
  }

  setDescription(description: string): this {
    this.data.description = description;
    return this;
  }

  setRequired(required = true): this {
    this.data.required = required;
    return this;
  }

  toJSON(): JsonObject {
    return { ...this.data };
  }
}

export class SlashCommandStringOption extends BaseCommandOptionBuilder {
  constructor() {
    super(ApplicationCommandOptionType.String);
  }

  setMinLength(minLength: number): this {
    this.data.min_length = minLength;
    return this;
  }

  setMaxLength(maxLength: number): this {
    this.data.max_length = maxLength;
    return this;
  }

  setAutocomplete(autocomplete = true): this {
    this.data.autocomplete = autocomplete;
    return this;
  }

  addChoices(...choices: APIApplicationCommandOptionChoice<string>[]): this {
    this.data.choices = choices.map((choice) => encodeValue(choice));
    return this;
  }
}

abstract class NumericCommandOptionBuilder extends BaseCommandOptionBuilder {
  setMinValue(minValue: number): this {
    this.data.min_value = minValue;
    return this;
  }

  setMaxValue(maxValue: number): this {
    this.data.max_value = maxValue;
    return this;
  }

  setAutocomplete(autocomplete = true): this {
    this.data.autocomplete = autocomplete;
    return this;
  }

  addChoices(...choices: APIApplicationCommandOptionChoice<number>[]): this {
    this.data.choices = choices.map((choice) => encodeValue(choice));
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
    this.data.channel_types = channelTypes;
    return this;
  }
}

type SlashOptionBuilder =
  | SlashCommandAttachmentOption
  | SlashCommandBooleanOption
  | SlashCommandChannelOption
  | SlashCommandIntegerOption
  | SlashCommandMentionableOption
  | SlashCommandNumberOption
  | SlashCommandRoleOption
  | SlashCommandStringOption
  | SlashCommandUserOption
  | SlashCommandSubcommand
  | SlashCommandSubcommandGroup;

class OptionContainer {
  protected options: SlashOptionBuilder[] = [];

  protected addOption<T extends SlashOptionBuilder>(option: T, input: (option: T) => T): this {
    this.options.push(input(option));
    return this;
  }

  addStringOption(input: (option: SlashCommandStringOption) => SlashCommandStringOption): this {
    return this.addOption(new SlashCommandStringOption(), input);
  }

  addIntegerOption(input: (option: SlashCommandIntegerOption) => SlashCommandIntegerOption): this {
    return this.addOption(new SlashCommandIntegerOption(), input);
  }

  addNumberOption(input: (option: SlashCommandNumberOption) => SlashCommandNumberOption): this {
    return this.addOption(new SlashCommandNumberOption(), input);
  }

  addBooleanOption(input: (option: SlashCommandBooleanOption) => SlashCommandBooleanOption): this {
    return this.addOption(new SlashCommandBooleanOption(), input);
  }

  addUserOption(input: (option: SlashCommandUserOption) => SlashCommandUserOption): this {
    return this.addOption(new SlashCommandUserOption(), input);
  }

  addChannelOption(input: (option: SlashCommandChannelOption) => SlashCommandChannelOption): this {
    return this.addOption(new SlashCommandChannelOption(), input);
  }

  addRoleOption(input: (option: SlashCommandRoleOption) => SlashCommandRoleOption): this {
    return this.addOption(new SlashCommandRoleOption(), input);
  }

  addMentionableOption(
    input: (option: SlashCommandMentionableOption) => SlashCommandMentionableOption,
  ): this {
    return this.addOption(new SlashCommandMentionableOption(), input);
  }

  addAttachmentOption(
    input: (option: SlashCommandAttachmentOption) => SlashCommandAttachmentOption,
  ): this {
    return this.addOption(new SlashCommandAttachmentOption(), input);
  }

  protected optionJson(): JsonObject[] {
    return this.options.map((option) => option.toJSON());
  }
}

export class SlashCommandSubcommand extends OptionContainer implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    type: ApplicationCommandOptionType.Subcommand,
  };

  setName(name: string): this {
    this.data.name = name;
    return this;
  }

  setDescription(description: string): this {
    this.data.description = description;
    return this;
  }

  toJSON(): JsonObject {
    return {
      ...this.data,
      ...(this.options.length > 0 ? { options: this.optionJson() } : {}),
    };
  }
}

export class SlashCommandSubcommandGroup
  extends OptionContainer
  implements JSONEncodable<JsonObject>
{
  private data: JsonObject = {
    type: ApplicationCommandOptionType.SubcommandGroup,
  };

  setName(name: string): this {
    this.data.name = name;
    return this;
  }

  setDescription(description: string): this {
    this.data.description = description;
    return this;
  }

  addSubcommand(input: (option: SlashCommandSubcommand) => SlashCommandSubcommand): this {
    return this.addOption(new SlashCommandSubcommand(), input);
  }

  toJSON(): JsonObject {
    return {
      ...this.data,
      ...(this.options.length > 0 ? { options: this.optionJson() } : {}),
    };
  }
}

export class SlashCommandOptionContainer extends OptionContainer {
  addSubcommand(input: (option: SlashCommandSubcommand) => SlashCommandSubcommand): this {
    return this.addOption(new SlashCommandSubcommand(), input);
  }

  addSubcommandGroup(
    input: (option: SlashCommandSubcommandGroup) => SlashCommandSubcommandGroup,
  ): this {
    return this.addOption(new SlashCommandSubcommandGroup(), input);
  }

  getOptionsJson(): JsonObject[] {
    return this.optionJson();
  }
}
