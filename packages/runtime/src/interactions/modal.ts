import type { APIModalSubmitInteraction } from "discord-api-types/v10";
import { DiscordRestClient } from "../rest.js";
import type { DiscordRequestContext, DiscordRuntimeEnv } from "../types/index.js";
import { ModalComponentResolver } from "../utils/handlers/index.js";
import { BaseInteraction } from "./base.js";

export class ModalInteraction extends BaseInteraction<APIModalSubmitInteraction> {
  readonly fields: ModalComponentResolver;

  constructor(
    rest: DiscordRestClient,
    raw: APIModalSubmitInteraction,
    context: DiscordRequestContext<DiscordRuntimeEnv>,
  ) {
    super(rest, raw, context);
    this.fields = new ModalComponentResolver(raw.data.components);
  }

  get customId(): string {
    return this.raw.data.custom_id;
  }
}
