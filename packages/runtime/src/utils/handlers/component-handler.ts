import { ComponentType } from "discord-api-types/v10";
import type { CommandHandlerFunction } from "../../types/index.js";
import type { MessageComponentInteraction } from "../../interactions/index.js";
import { parseCustomId } from "./utils.js";

/** Handles message-component interactions matched by `custom_id` prefix. */
export class ComponentHandler {
  readonly handlerType = "component" as const;
  private handlerFn: CommandHandlerFunction<MessageComponentInteraction> | undefined;

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

  addHandler(handler: CommandHandlerFunction<MessageComponentInteraction>): this {
    this.handlerFn = handler;
    return this;
  }

  matches(customId: string): boolean {
    return parseCustomId(customId, true) === this.prefix;
  }

  async execute(interaction: MessageComponentInteraction): Promise<void> {
    if (!this.handlerFn) {
      throw new Error(`Component handler "${this.prefix}" does not have a handler`);
    }
    await this.handlerFn(interaction);
  }
}
