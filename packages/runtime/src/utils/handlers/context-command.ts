import { ApplicationCommandType } from "discord-api-types/v10";
import type { CommandHandlerFunction, JsonObject } from "../../types/index.js";
import type { CommandInteraction } from "../../interactions/index.js";

/**
 * The type of a Discord context menu command.
 * Maps directly to the underlying `ApplicationCommandType` values for
 * user and message context commands.
 */
export enum ContextCommandType {
  /** Appears in the context menu when right-clicking a user. */
  User = ApplicationCommandType.User,
  /** Appears in the context menu when right-clicking a message. */
  Message = ApplicationCommandType.Message,
}

/**
 * Represents a Discord context menu command (right-click on a user or message).
 *
 * @example
 * ```ts
 * const whoIs = new ContextCommand(ContextCommandType.User)
 *   .setName("Who is this?")
 *   .addHandler(async (interaction) => {
 *     await interaction.reply({ content: "A mystery!" });
 *   });
 * ```
 */
export class ContextCommand {
  /** Discriminant used to identify this handler type at runtime. */
  readonly handlerType = "context" as const;

  /**
   * Guild IDs this command is scoped to.
   * Empty means the command is registered globally.
   */
  readonly guildIds = new Set<string>();

  /** The command name as it appears in Discord's context menu. */
  name = "";

  /** The function invoked when this context command is triggered. */
  private handlerFn?: CommandHandlerFunction<CommandInteraction>;

  /**
   * @param {ContextCommandType} commandType - Whether this is a user or message context command.
   */
  constructor(private readonly commandType: ContextCommandType) {}

  /**
   * Sets the context menu entry name.
   *
   * @param {string} name - The display name (1–32 characters, supports mixed case).
   * @returns {this} `this` for chaining.
   */
  setName(name: string): this {
    this.name = name;
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
   * Registers the function to invoke when this context command is triggered.
   *
   * @param {CommandHandlerFunction<CommandInteraction>} handler - An async function receiving the `CommandInteraction`.
   * @returns {this} `this` for chaining.
   */
  addHandler(handler: CommandHandlerFunction<CommandInteraction>): this {
    this.handlerFn = handler;
    return this;
  }

  /**
   * Invokes the registered handler with the given interaction.
   *
   * @param {CommandInteraction} interaction - The incoming context-menu interaction.
   * @throws {Error} When no handler has been registered via {@link addHandler}.
   */
  async execute(interaction: CommandInteraction): Promise<void> {
    if (!this.handlerFn) {
      throw new Error(`Context command "${this.name}" does not have a handler`);
    }
    await this.handlerFn(interaction);
  }

  /**
   * Serialises the command into the JSON shape expected by the Discord API.
   *
   * @returns {JsonObject} A `JsonObject` ready for use in a `PUT /applications/{id}/commands` payload.
   */
  toJSON(): JsonObject {
    return {
      name: this.name,
      type: this.commandType,
    };
  }
}
