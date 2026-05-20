import type { CommandHandlerFunction } from "../../types/index.js";
import type { ModalInteraction } from "../../interactions/index.js";
import { parseCustomId } from "./custom-id.js";

/**
 * Handles modal-submit interactions whose `custom_id` starts with a given prefix.
 *
 * Like {@link ComponentHandler}, the prefix is matched against the leading
 * segment of `custom_id` so one handler can cover many dynamically-keyed modals.
 *
 * @example
 * ```ts
 * const feedbackModal = new ModalHandler("feedback")
 *   .addHandler(async (interaction) => {
 *     const text = interaction.fields.getString("message");
 *     await interaction.reply({ content: `Got it: ${text}` });
 *   });
 * ```
 */
export class ModalHandler {
  /** Discriminant used to identify this handler type at runtime. */
  readonly handlerType = "modal" as const;

  /** The function invoked when a matching modal-submit interaction is received. */
  private handlerFn: CommandHandlerFunction<ModalInteraction> | undefined;

  /**
   * @param {string} prefix - The `custom_id` prefix this handler claims. Must be non-empty.
   * @param {CommandHandlerFunction<ModalInteraction> | undefined} handler - An optional handler function; can also be set via {@link addHandler}.
   * @throws {TypeError} When `prefix` is an empty string.
   */
  constructor(
    readonly prefix: string,
    handler?: CommandHandlerFunction<ModalInteraction>,
  ) {
    if (!prefix) {
      throw new TypeError("Modal handler prefix must be non-empty");
    }
    this.handlerFn = handler;
  }

  /**
   * Registers the function to invoke when a matching modal-submit interaction arrives.
   *
   * @param {CommandHandlerFunction<ModalInteraction>} handler - An async function receiving the `ModalInteraction`.
   * @returns {this} `this` for chaining.
   */
  addHandler(handler: CommandHandlerFunction<ModalInteraction>): this {
    this.handlerFn = handler;
    return this;
  }

  /**
   * Returns whether this handler should process the modal with the given `custom_id`.
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
   * @param {ModalInteraction} interaction - The incoming modal-submit interaction.
   * @throws {Error} When no handler has been registered via {@link addHandler}.
   */
  async execute(interaction: ModalInteraction): Promise<void> {
    if (!this.handlerFn) {
      throw new Error(`Modal handler "${this.prefix}" does not have a handler`);
    }
    await this.handlerFn(interaction);
  }
}
