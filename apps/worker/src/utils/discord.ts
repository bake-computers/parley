import { InteractionResponseType } from "discord-api-types/v10";
import type {
  DiscordApiError,
  JSONEncodable,
  JsonObject,
  JsonValue,
  Result,
} from "@parley/runtime";

// discord-api-types/v10: Ephemeral (64) | IsComponentsV2 (32768)
export const COMPONENTS_V2_ONLY = 32768;
export const COMPONENTS_V2_EPHEMERAL = 64 | COMPONENTS_V2_ONLY;

// A top-level Components V2 message component: a container (the bordered card) or
// an action row (a button row rendered outside any container).
type V2Component = JSONEncodable<JsonObject>;

type V2Payload = { components: V2Component[]; flags?: number };

type ReplyableInteraction = {
  reply: (
    options: V2Payload,
    forceEphemeral?: boolean,
  ) => Promise<Result<JsonValue, DiscordApiError>>;
};

type UpdatableInteraction = {
  update: (options: V2Payload) => Promise<Result<JsonValue, DiscordApiError>>;
};

type EditableInteraction = {
  editReply: (
    options: V2Payload,
    messageId?: string,
  ) => Promise<Result<JsonValue, DiscordApiError>>;
};

function asComponents(components: V2Component | V2Component[]): V2Component[] {
  return Array.isArray(components) ? components : [components];
}

export async function replyV2(
  interaction: ReplyableInteraction,
  components: V2Component | V2Component[],
  forceEphemeral = true,
): Promise<Result<JsonValue, DiscordApiError>> {
  return interaction.reply(
    {
      components: asComponents(components),
      flags: forceEphemeral ? COMPONENTS_V2_EPHEMERAL : COMPONENTS_V2_ONLY,
    },
    forceEphemeral,
  );
}

/**
 * Respond to a button click or modal submit by updating the source message
 * in place. Posts InteractionResponseType.UpdateMessage (7).
 *
 * Use this for wizard transitions — not {@link editReplyV2}, which goes to
 * the webhook PATCH endpoint and never satisfies the interaction response,
 * causing Discord to time out and show "Something went wrong".
 */
export async function updateV2(
  interaction: UpdatableInteraction,
  components: V2Component | V2Component[],
): Promise<Result<JsonValue, DiscordApiError>> {
  const result = await interaction.update({
    components: asComponents(components),
    flags: COMPONENTS_V2_EPHEMERAL,
  });
  if (result.isOk()) {
    const value = result.value;
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      value["type"] !== InteractionResponseType.UpdateMessage
    ) {
      throw new TypeError(
        `updateV2 expected response type 7 (UpdateMessage) but got ${String(value["type"])}`,
      );
    }
  }
  return result;
}

export async function editReplyV2(
  interaction: EditableInteraction,
  components: V2Component | V2Component[],
  messageId = "@original",
): Promise<Result<JsonValue, DiscordApiError>> {
  return interaction.editReply(
    {
      components: asComponents(components),
      flags: COMPONENTS_V2_EPHEMERAL,
    },
    messageId,
  );
}

export function readMessageIdFromEditResult(
  result: Result<JsonValue, DiscordApiError>,
): string | undefined {
  if (result.isErr()) {
    return undefined;
  }

  const value = result.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const id = value["id"];
  return typeof id === "string" && /^\d+$/u.test(id) ? id : undefined;
}
