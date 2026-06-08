import { InteractionResponseType } from "discord-api-types/v10";
import { ok, type Result } from "neverthrow";
import type { DiscordApiError, JsonObject, JsonValue } from "../types/index.js";
import { ModalBuilder } from "../builders/index.js";
import { interactionErrorResult, tryCaptureInitialResponse } from "./helpers.js";
import { BaseInteraction } from "./base.js";
import type { APIInteraction } from "discord-api-types/v10";

export class ModalCapableInteraction<
  Raw extends APIInteraction = APIInteraction,
> extends BaseInteraction<Raw> {
  showModal(data: JsonObject | ModalBuilder): Promise<Result<JsonValue, DiscordApiError>> {
    const modal = data instanceof ModalBuilder ? data.toJSON() : data;
    if (!modal["custom_id"] || !modal["title"] || !modal["components"]) {
      return Promise.resolve(
        interactionErrorResult(
          "POST",
          `/interactions/${this.id}/${this.token}/callback`,
          "Modal payload is missing required fields",
        ),
      );
    }

    const payload = {
      type: InteractionResponseType.Modal,
      data: modal,
    } as JsonObject;

    if (!this.deferred && !this.replied && tryCaptureInitialResponse(this.context, payload)) {
      this.replied = true;
      return Promise.resolve(ok(payload));
    }

    return this.rest.createInteractionResponse<JsonValue>(this.id, this.token, payload);
  }
}
