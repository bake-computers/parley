import type { JsonObject } from "~/types/index.js";
import {
  SlashCommandStringOption,
  SlashCommandIntegerOption,
  SlashCommandNumberOption,
  SlashCommandBooleanOption,
  SlashCommandUserOption,
  SlashCommandChannelOption,
  SlashCommandRoleOption,
  SlashCommandMentionableOption,
  SlashCommandAttachmentOption,
} from "./option-builders.js";
import type { SlashOptionBuilder } from "./option-types.js";

export class OptionContainer {
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
