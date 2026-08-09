import { ApplicationCommandType } from "discord-api-types/v10";
import { SlashCommandOptionContainer } from "../../builders/command-options.js";
import type {
  AutocompleteHandlerFunction,
  CommandHandlerFunction,
  JsonObject,
} from "../../types/index.js";
import type { AutocompleteInteraction } from "../../interactions/autocomplete.js";
import type { ChatInputCommandInteraction } from "../../interactions/command.js";

/** Discord slash (`/`) command with fluent option builders and handlers. */
export class SlashCommand extends SlashCommandOptionContainer {
  readonly handlerType = "slash" as const;

  /** Empty means the command is registered globally. */
  readonly guildIds = new Set<string>();

  name = "";
  private description = "";
  private handlerFn?: CommandHandlerFunction<ChatInputCommandInteraction>;
  private autocompleteFn?: AutocompleteHandlerFunction<AutocompleteInteraction>;
  private defaultMemberPermissions?: string;

  setName(name: string): this {
    this.name = name;
    return this;
  }

  setDescription(description: string): this {
    this.description = description;
    return this;
  }

  isGuildCommand(): boolean {
    return this.guildIds.size > 0;
  }

  setGuildIds(guildIds: Iterable<string>): this {
    this.guildIds.clear();
    for (const guildId of guildIds) {
      this.guildIds.add(guildId);
    }
    return this;
  }

  addGuildIds(...guildIds: string[]): this {
    for (const guildId of guildIds) {
      this.guildIds.add(guildId);
    }
    return this;
  }

  removeGuildIds(...guildIds: string[]): this {
    for (const guildId of guildIds) {
      this.guildIds.delete(guildId);
    }
    return this;
  }

  setDefaultMemberPermissions(bitfield: string): this {
    this.defaultMemberPermissions = bitfield;
    return this;
  }

  addHandler(handler: CommandHandlerFunction<ChatInputCommandInteraction>): this {
    this.handlerFn = handler;
    return this;
  }

  addAutocompleteHandler(handler: AutocompleteHandlerFunction<AutocompleteInteraction>): this {
    this.autocompleteFn = handler;
    return this;
  }

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.handlerFn) {
      throw new Error(`Command "${this.name}" does not have a handler`);
    }
    await this.handlerFn(interaction);
  }

  async executeAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (!this.autocompleteFn) {
      throw new Error(`Command "${this.name}" does not have an autocomplete handler`);
    }
    await this.autocompleteFn(interaction);
  }

  toJSON(): JsonObject {
    return {
      name: this.name,
      description: this.description,
      type: ApplicationCommandType.ChatInput,
      ...(this.getOptionsJson().length > 0 ? { options: this.getOptionsJson() } : {}),
      ...(this.defaultMemberPermissions !== undefined
        ? { default_member_permissions: this.defaultMemberPermissions }
        : {}),
    };
  }
}
