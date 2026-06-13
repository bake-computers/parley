import { InteractionResponseType } from "discord-api-types/v10";
import type { ContainerBuilder, DiscordApiError, JsonValue } from "@parley/runtime";
import { type Result } from "neverthrow";

// discord-api-types/v10: Ephemeral (64) | IsComponentsV2 (32768)
export const COMPONENTS_V2_ONLY = 32768;
export const COMPONENTS_V2_EPHEMERAL = 64 | COMPONENTS_V2_ONLY;

type V2Payload = { components: ContainerBuilder[]; flags?: number };

type ReplyableInteraction = {
  reply: (
    options: V2Payload,
    forceEphemeral?: boolean,
  ) => Promise<Result<JsonValue, DiscordApiError>>;
};

type UpdatableInteraction = {
  update: (
    options: V2Payload,
  ) => Promise<Result<JsonValue, DiscordApiError>>;
};

type EditableInteraction = {
  editReply: (
    options: V2Payload,
    messageId?: string,
  ) => Promise<Result<JsonValue, DiscordApiError>>;
};

export async function replyV2(
  interaction: ReplyableInteraction,
  container: ContainerBuilder,
  forceEphemeral = true,
): Promise<Result<JsonValue, DiscordApiError>> {
  return interaction.reply(
    {
      components: [container],
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
  container: ContainerBuilder,
): Promise<Result<JsonValue, DiscordApiError>> {
  const result = await interaction.update({
    components: [container],
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
  container: ContainerBuilder,
  messageId = "@original",
): Promise<Result<JsonValue, DiscordApiError>> {
  return interaction.editReply(
    {
      components: [container],
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
