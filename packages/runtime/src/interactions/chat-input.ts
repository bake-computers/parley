import { type APIChatInputApplicationCommandInteraction } from "discord-api-types/v10";
import { DiscordRestClient } from "../rest.js";
import type { DiscordRequestContext, DiscordRuntimeEnv } from "../types/index.js";
import { CommandInteractionOptionResolver } from "../utils/handlers/index.js";
import { CommandInteraction } from "./command.js";

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
