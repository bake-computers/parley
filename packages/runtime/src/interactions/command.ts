import {
  ApplicationCommandType,
  type APIApplicationCommandInteraction,
  type APIChatInputApplicationCommandInteraction,
} from "discord-api-types/v10";
import { DiscordRestClient } from "../rest.js";
import type { DiscordRequestContext, DiscordRuntimeEnv } from "../types/index.js";
import { CommandInteractionOptionResolver } from "../utils/handlers/resolver.js";
import { ModalCapableInteraction } from "./base.js";

export class CommandInteraction<
  Raw extends APIApplicationCommandInteraction = APIApplicationCommandInteraction,
> extends ModalCapableInteraction<Raw> {
  get commandName(): string {
    return this.raw.data.name;
  }

  get commandId(): string {
    return this.raw.data.id;
  }

  get commandType(): ApplicationCommandType {
    return this.raw.data.type;
  }
}

export class ChatInputCommandInteraction extends CommandInteraction<APIChatInputApplicationCommandInteraction> {
  readonly options: CommandInteractionOptionResolver;

  constructor(
    rest: DiscordRestClient,
    raw: APIChatInputApplicationCommandInteraction,
    context: DiscordRequestContext<DiscordRuntimeEnv>,
  ) {
    super(rest, raw, context);
    this.options = new CommandInteractionOptionResolver(raw.data.options, raw.data.resolved);
  }
}
