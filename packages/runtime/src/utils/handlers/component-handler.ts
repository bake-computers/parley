import { ComponentType } from "discord-api-types/v10";
import type { CommandHandlerFunction } from "../../types/index.js";
import type { MessageComponentInteraction } from "../../interactions/index.js";
import { parseCustomId } from "./custom-id.js";

/**
 * Handles interactions from a specific Discord message component (button,
 * select menu, etc.) identified by a `custom_id` prefix.
 *
 * The `prefix` is matched against the leading segment of the component's
 * `custom_id` (i.e., everything before the first `/` or `?`), allowing a
 * single handler to cover many dynamically-generated component IDs.
 *
 * @example
 * ```ts
 * const confirmButton = new ComponentHandler("confirm", ComponentType.Button)
 *   .addHandler(async (interaction) => {
 *     await interaction.reply({ content: "Confirmed!" });
 *   });
 * ```
 */
export class ComponentHandler {
  /** Discriminant used to identify this handler type at runtime. */
  readonly handlerType = "component" as const;

  /** The function invoked when a matching component interaction is received. */
  private handlerFn: CommandHandlerFunction<MessageComponentInteraction> | undefined;

  /**
   * @param {string} prefix - The `custom_id` prefix this handler claims. Must be non-empty.
   * @param {ComponentType} componentType - The Discord component type this handler targets.
   * @param {CommandHandlerFunction<MessageComponentInteraction> | undefined} handler - An optional handler function; can also be set via {@link addHandler}.
   * @throws {TypeError} When `prefix` is an empty string.
   */
  constructor(
    readonly prefix: string,
    readonly componentType: ComponentType,
    handler?: CommandHandlerFunction<MessageComponentInteraction>,
  ) {
    if (!prefix) {
      throw new TypeError("Component handler prefix must be non-empty");
    }
    this.handlerFn = handler;
  }

  /**
   * Registers the function to invoke when a matching component interaction arrives.
   *
   * @param {CommandHandlerFunction<MessageComponentInteraction>} handler - An async function receiving the `MessageComponentInteraction`.
   * @returns {this} `this` for chaining.
   */
  addHandler(handler: CommandHandlerFunction<MessageComponentInteraction>): this {
    this.handlerFn = handler;
    return this;
  }

  /**
   * Returns whether this handler should process the component with the given `custom_id`.
   *
   * @param {string} customId - The `custom_id` from the incoming interaction.
   * @returns {boolean} `true` if the leading prefix of `customId` equals {@link prefix}.
   */
  matches(customId: string): boolean {
    return parseCustomId(customId, true) === this.prefix;
  }

  /**
   * Invokes the registered handler with the given interaction.
   *
   * @param {MessageComponentInteraction} interaction - The incoming message component interaction.
   * @throws {Error} When no handler has been registered via {@link addHandler}.
   */
  async execute(interaction: MessageComponentInteraction): Promise<void> {
    if (!this.handlerFn) {
      throw new Error(`Component handler "${this.prefix}" does not have a handler`);
    }
    await this.handlerFn(interaction);
  }
}
