import { ApplicationCommandOptionType } from "discord-api-types/v10";
import type { JsonObject } from "~/types/index.js";
import {
  SlashCommandAttachmentOption,
  SlashCommandBooleanOption,
  SlashCommandChannelOption,
  SlashCommandIntegerOption,
  SlashCommandMentionableOption,
  SlashCommandNumberOption,
  SlashCommandRoleOption,
  SlashCommandStringOption,
  SlashCommandUserOption,
} from "./options.js";
import type { JSONEncodable } from "./types.js";

export type SlashOptionBuilder =
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

export class SlashCommandSubcommand extends OptionContainer implements JSONEncodable<JsonObject> {
  private data: JsonObject = {
    type: ApplicationCommandOptionType.Subcommand,
  };

  setName(name: string): this {
    this.data["name"] = name;
    return this;
  }

  setDescription(description: string): this {
    this.data["description"] = description;
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
    this.data["name"] = name;
    return this;
  }

  setDescription(description: string): this {
    this.data["description"] = description;
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
