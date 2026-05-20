import {
  InteractionResponseType,
  type APIApplicationCommandAutocompleteInteraction,
} from "discord-api-types/v10";
import { ok, type Result } from "neverthrow";
import { DiscordRestClient } from "../rest.js";
import type {
  DiscordApiError,
  DiscordRequestContext,
  DiscordRuntimeEnv,
  JsonObject,
  JsonValue,
} from "../types/index.js";
import { CommandInteractionOptionResolver } from "../utils/handlers/index.js";
import { tryCaptureInitialResponse } from "./helpers.js";
import { BaseInteraction } from "./base.js";

export class AutocompleteInteraction extends BaseInteraction<APIApplicationCommandAutocompleteInteraction> {
  readonly options: CommandInteractionOptionResolver;
  responded = false;

  constructor(
    rest: DiscordRestClient,
    raw: APIApplicationCommandAutocompleteInteraction,
    context: DiscordRequestContext<DiscordRuntimeEnv>,
  ) {
    super(rest, raw, context);
    this.options = new CommandInteractionOptionResolver(raw.data.options, raw.data.resolved);
  }

  get commandName(): string {
    return this.raw.data.name;
  }

  async respond(
    choices: { name: string; value: string | number }[],
  ): Promise<Result<JsonValue, DiscordApiError>> {
    const payload = {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: { choices },
    } as JsonObject;

    if (!this.responded && tryCaptureInitialResponse(this.context, payload)) {
      this.responded = true;
      return ok(payload);
    }

    const result = await this.rest.createInteractionResponse<JsonValue>(
      this.id,
      this.token,
      payload,
    );
    if (result.isOk()) {
      this.responded = true;
    }
    return result;
  }
}
