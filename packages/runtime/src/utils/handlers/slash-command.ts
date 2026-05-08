import { ApplicationCommandType } from "discord-api-types/v10";
import { SlashCommandOptionContainer } from "../../builders/index.js";
import type {
  AutocompleteHandlerFunction,
  CommandHandlerFunction,
  JsonObject,
} from "../../types/index.js";
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "../../interactions/index.js";

/**
 * Represents a Discord slash (`/`) command, including its metadata, option
 * definitions, optional guild scope, and execution/autocomplete handlers.
 *
 * Extends {@link SlashCommandOptionContainer} to support fluent option chaining.
 *
 * @example
 * ```ts
 * const ping = new SlashCommand()
 *   .setName("ping")
 *   .setDescription("Replies with pong")
 *   .addHandler(async (interaction) => {
 *     await interaction.reply({ content: "Pong!" });
 *   });
 * ```
 */
export class SlashCommand extends SlashCommandOptionContainer {
  /** Discriminant used to identify this handler type at runtime. */
  readonly handlerType = "slash" as const;

  /**
   * Guild IDs this command is scoped to.
   * Empty means the command is registered globally.
   */
  readonly guildIds = new Set<string>();

  /** The command name as registered with Discord (must be lowercase). */
  name = "";

  /** The short description shown in the Discord UI. */
  private description = "";

  /** The function invoked when this command is executed. */
  private handlerFn?: CommandHandlerFunction<ChatInputCommandInteraction>;

  /** The function invoked for autocomplete events on this command's options. */
  private autocompleteFn?: AutocompleteHandlerFunction<AutocompleteInteraction>;

  /**
   * Sets the command name.
   *
   * @param {string} name - The slash command name (lowercase, no spaces).
   * @returns {this} `this` for chaining.
   */
  setName(name: string): this {
    this.name = name;
    return this;
  }

  /**
   * Sets the command description shown in the Discord UI.
   *
   * @param {string} description - A short description (1–100 characters).
   * @returns {this} `this` for chaining.
   */
  setDescription(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * Returns whether this command is scoped to one or more guilds.
   *
   * @returns {boolean} `true` if `guildIds` is non-empty.
   */
  isGuildCommand(): boolean {
    return this.guildIds.size > 0;
  }

  /**
   * Replaces the current guild scope with the provided set of guild IDs.
   *
   * @param {Iterable<string>} guildIds - An iterable of guild Snowflake IDs.
   * @returns {this} `this` for chaining.
   */
  setGuildIds(guildIds: Iterable<string>): this {
    this.guildIds.clear();
    for (const guildId of guildIds) {
      this.guildIds.add(guildId);
    }
    return this;
  }

  /**
   * Adds one or more guild IDs to the command's guild scope.
   *
   * @param {...string[]} guildIds - Guild Snowflake IDs to add.
   * @returns {this} `this` for chaining.
   */
  addGuildIds(...guildIds: string[]): this {
    for (const guildId of guildIds) {
      this.guildIds.add(guildId);
    }
    return this;
  }

  /**
   * Removes one or more guild IDs from the command's guild scope.
   *
   * @param {...string[]} guildIds - Guild Snowflake IDs to remove.
   * @returns {this} `this` for chaining.
   */
  removeGuildIds(...guildIds: string[]): this {
    for (const guildId of guildIds) {
      this.guildIds.delete(guildId);
    }
    return this;
  }

  /**
   * Registers the function to invoke when this command is executed.
   *
   * @param {CommandHandlerFunction<ChatInputCommandInteraction>} handler - An async function receiving the `ChatInputCommandInteraction`.
   * @returns {this} `this` for chaining.
   */
  addHandler(handler: CommandHandlerFunction<ChatInputCommandInteraction>): this {
    this.handlerFn = handler;
    return this;
  }

  /**
   * Registers the function to invoke for autocomplete events on this command.
   *
   * @param {AutocompleteHandlerFunction<AutocompleteInteraction>} handler - An async function receiving the `AutocompleteInteraction`.
   * @returns {this} `this` for chaining.
   */
  addAutocompleteHandler(handler: AutocompleteHandlerFunction<AutocompleteInteraction>): this {
    this.autocompleteFn = handler;
    return this;
  }

  /**
   * Invokes the registered command handler with the given interaction.
   *
   * @param {ChatInputCommandInteraction} interaction - The incoming chat-input interaction.
   * @throws {Error} When no handler has been registered via {@link addHandler}.
   */
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.handlerFn) {
      throw new Error(`Command "${this.name}" does not have a handler`);
    }
    await this.handlerFn(interaction);
  }

  /**
   * Invokes the registered autocomplete handler with the given interaction.
   *
   * @param {AutocompleteInteraction} interaction - The incoming autocomplete interaction.
   * @throws {Error} When no handler has been registered via {@link addAutocompleteHandler}.
   */
  async executeAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (!this.autocompleteFn) {
      throw new Error(`Command "${this.name}" does not have an autocomplete handler`);
    }
    await this.autocompleteFn(interaction);
  }

  /**
   * Serialises the command into the JSON shape expected by the Discord API.
   *
   * @returns {JsonObject} A `JsonObject` ready for use in a `PUT /applications/{id}/commands` payload.
   */
  toJSON(): JsonObject {
    return {
      name: this.name,
      description: this.description,
      type: ApplicationCommandType.ChatInput,
      ...(this.getOptionsJson().length > 0 ? { options: this.getOptionsJson() } : {}),
    };
  }
}
