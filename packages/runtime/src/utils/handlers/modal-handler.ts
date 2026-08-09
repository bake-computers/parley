import type { CommandHandlerFunction } from "../../types/index.js";
import type { ModalInteraction } from "../../interactions/index.js";
import { parseCustomId } from "./utils.js";

/** Handles modal-submit interactions matched by `custom_id` prefix. */
export class ModalHandler {
  readonly handlerType = "modal" as const;
  private handlerFn: CommandHandlerFunction<ModalInteraction> | undefined;

  constructor(
    readonly prefix: string,
    handler?: CommandHandlerFunction<ModalInteraction>,
  ) {
    if (!prefix) {
      throw new TypeError("Modal handler prefix must be non-empty");
    }
    this.handlerFn = handler;
  }

  addHandler(handler: CommandHandlerFunction<ModalInteraction>): this {
    this.handlerFn = handler;
    return this;
  }

  matches(customId: string): boolean {
    return parseCustomId(customId, true) === this.prefix;
  }

  async execute(interaction: ModalInteraction): Promise<void> {
    if (!this.handlerFn) {
      throw new Error(`Modal handler "${this.prefix}" does not have a handler`);
    }
    await this.handlerFn(interaction);
  }
}
