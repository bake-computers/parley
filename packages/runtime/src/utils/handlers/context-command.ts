import { ApplicationCommandType } from "discord-api-types/v10";
import type { CommandHandlerFunction, JsonObject } from "../../types/index.js";
import type { CommandInteraction } from "../../interactions/command.js";

/** User or message context-menu command type. */
export enum ContextCommandType {
  User = ApplicationCommandType.User,
  Message = ApplicationCommandType.Message,
}

/** Discord context menu command (right-click user/message). */
export class ContextCommand {
  readonly handlerType = "context" as const;

  /** Empty means the command is registered globally. */
  readonly guildIds = new Set<string>();

  name = "";
  private handlerFn?: CommandHandlerFunction<CommandInteraction>;

  constructor(private readonly commandType: ContextCommandType) {}

  setName(name: string): this {
    this.name = name;
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

  addHandler(handler: CommandHandlerFunction<CommandInteraction>): this {
    this.handlerFn = handler;
    return this;
  }

  async execute(interaction: CommandInteraction): Promise<void> {
    if (!this.handlerFn) {
      throw new Error(`Context command "${this.name}" does not have a handler`);
    }
    await this.handlerFn(interaction);
  }

  toJSON(): JsonObject {
    return {
      name: this.name,
      type: this.commandType,
    };
  }
}
