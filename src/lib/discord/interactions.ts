import {
  ApplicationCommandType,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type APIApplicationCommandAutocompleteInteraction,
  type APIApplicationCommandInteraction,
  type APIChatInputApplicationCommandInteraction,
  type APIInteraction,
  type APIMessageComponentInteraction,
  type APIModalSubmitInteraction,
  type APIUser,
} from "discord-api-types/v10";
import { err, type Result } from "neverthrow";
import { isJSONEncodable, ModalBuilder, type JSONEncodable } from "./builders";
import { CommandInteractionOptionResolver, ModalComponentResolver } from "./handlers";
import { DiscordRestClient } from "./rest";
import type {
  DiscordApiError,
  DiscordRequestContext,
  DiscordRuntimeEnv,
  JsonObject,
  JsonValue,
} from "./types";
import { logger } from "../logger";

export interface InteractionResponseOptions {
  content?: string;
  tts?: boolean;
  embeds?: (JsonObject | JSONEncodable<JsonObject>)[];
  components?: (JsonObject | JSONEncodable<JsonObject>)[];
  allowed_mentions?: JsonObject;
  flags?: number;
  poll?: JsonObject;
  attachments?: JsonObject[];
  [key: string]: unknown;
}

type InteractionWithCommonFields = APIInteraction & {
  application_id: string;
  token: string;
  id: string;
  guild_id?: string;
  channel?: { id: string };
  member?: { user?: APIUser };
  user?: APIUser;
  guild_locale?: string;
};

function isJsonValue(value: unknown): value is JsonValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value) ||
    (typeof value === "object" && value !== null)
  );
}

function normalizePayload(input: string | InteractionResponseOptions): InteractionResponseOptions {
  return typeof input === "string" ? { content: input } : { ...input };
}

function resolveArray(value: unknown): JsonValue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => (isJSONEncodable(item) ? item.toJSON() : (item as JsonValue)));
}

function prepareResponsePayload(options: InteractionResponseOptions): JsonObject {
  const payload: JsonObject = {};

  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) {
      continue;
    }
    if (key === "embeds" || key === "components") {
      const resolved = resolveArray(value);
      if (resolved && resolved.length > 0) {
        payload[key] = resolved;
      }
      continue;
    }
    if (isJsonValue(value)) {
      payload[key] = value;
    }
  }

  return payload;
}

function interactionErrorResult(
  method: string,
  path: string,
  message: string,
): Result<never, DiscordApiError> {
  return err({
    kind: "discord-api",
    method,
    path,
    message,
    retryable: false,
  });
}

export class BaseInteraction<Raw extends APIInteraction = APIInteraction> {
  readonly raw: Raw;
  readonly type: InteractionType;
  replied = false;
  deferred = false;

  constructor(
    protected readonly rest: DiscordRestClient,
    raw: Raw,
    readonly context: DiscordRequestContext<DiscordRuntimeEnv>,
  ) {
    this.raw = raw;
    this.type = raw.type;
  }

  private get common(): InteractionWithCommonFields {
    return this.raw as InteractionWithCommonFields;
  }

  get applicationId(): string {
    return this.common.application_id;
  }

  get channelId(): string | undefined {
    return this.common.channel?.id;
  }

  get guildId(): string | undefined {
    return this.common.guild_id;
  }

  get userId(): string | undefined {
    return this.user?.id;
  }

  get user(): APIUser | undefined {
    return this.common.member?.user ?? this.common.user;
  }

  get token(): string {
    return this.common.token;
  }

  get id(): string {
    return this.common.id;
  }

  get guildLocale(): string | undefined {
    return this.common.guild_locale;
  }

  inGuild(): boolean {
    return Boolean(this.guildId);
  }

  inDM(): boolean {
    return !this.inGuild();
  }

  async reply(
    options: string | InteractionResponseOptions,
    forceEphemeral = true,
  ): Promise<Result<JsonValue, DiscordApiError>> {
    const data = normalizePayload(options);
    if (forceEphemeral) {
      data.flags = (data.flags ?? 0) | MessageFlags.Ephemeral;
    }

    const result = await this.rest.createInteractionResponse<JsonValue>(this.id, this.token, {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: prepareResponsePayload(data),
    });
    if (result.isErr()) {
      logger.error("discord.interaction.reply_failed", "Failed to reply to interaction", {
        interactionId: this.id,
        error: result.error,
      });
    } else {
      this.replied = true;
    }
    return result;
  }

  async deferReply(forceEphemeral = true): Promise<Result<JsonValue, DiscordApiError>> {
    const result = await this.rest.createInteractionResponse<JsonValue>(this.id, this.token, {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: forceEphemeral ? { flags: MessageFlags.Ephemeral } : {},
    });
    if (result.isErr()) {
      logger.error("discord.interaction.defer_failed", "Failed to defer interaction", {
        interactionId: this.id,
        error: result.error,
      });
    } else {
      this.deferred = true;
    }
    return result;
  }

  async deferUpdate(): Promise<Result<JsonValue, DiscordApiError>> {
    return this.rest.createInteractionResponse<JsonValue>(this.id, this.token, {
      type: InteractionResponseType.DeferredMessageUpdate,
    });
  }

  async editReply(
    options: string | InteractionResponseOptions,
    messageId = "@original",
  ): Promise<Result<JsonValue, DiscordApiError>> {
    const result = await this.rest.editWebhookMessage<JsonValue>(
      this.applicationId,
      this.token,
      messageId,
      prepareResponsePayload(normalizePayload(options)),
    );
    if (result.isErr()) {
      logger.error("discord.interaction.edit_failed", "Failed to edit interaction reply", {
        interactionId: this.id,
        error: result.error,
      });
    } else {
      this.replied = true;
    }
    return result;
  }

  async followUp(
    options: string | InteractionResponseOptions,
    forceEphemeral = false,
  ): Promise<Result<JsonValue, DiscordApiError>> {
    const data = normalizePayload(options);
    if (forceEphemeral) {
      data.flags = (data.flags ?? 0) | MessageFlags.Ephemeral;
    }
    return this.rest.createWebhookMessage<JsonValue>(
      this.applicationId,
      this.token,
      prepareResponsePayload(data),
    );
  }

  async deleteReply(messageId = "@original"): Promise<Result<void, DiscordApiError>> {
    return this.rest.deleteWebhookMessage(this.applicationId, this.token, messageId);
  }

  async update(
    options: string | InteractionResponseOptions,
  ): Promise<Result<JsonValue, DiscordApiError>> {
    const result = await this.rest.createInteractionResponse<JsonValue>(this.id, this.token, {
      type: InteractionResponseType.UpdateMessage,
      data: prepareResponsePayload(normalizePayload(options)),
    });
    if (result.isOk()) {
      this.replied = true;
    }
    return result;
  }

  isCommand(): this is CommandInteraction {
    return this.raw.type === InteractionType.ApplicationCommand;
  }

  isChatInputCommand(): this is ChatInputCommandInteraction {
    return (
      this.raw.type === InteractionType.ApplicationCommand &&
      (this.raw as APIApplicationCommandInteraction).data.type === ApplicationCommandType.ChatInput
    );
  }

  isMessageComponent(): this is MessageComponentInteraction {
    return this.raw.type === InteractionType.MessageComponent;
  }

  isModal(): this is ModalInteraction {
    return this.raw.type === InteractionType.ModalSubmit;
  }
}

export class ModalCapableInteraction<
  Raw extends APIInteraction = APIInteraction,
> extends BaseInteraction<Raw> {
  async showModal(data: JsonObject | ModalBuilder): Promise<Result<JsonValue, DiscordApiError>> {
    const modal = data instanceof ModalBuilder ? data.toJSON() : data;
    if (!modal.custom_id || !modal.title || !modal.components) {
      return interactionErrorResult(
        "POST",
        `/interactions/${this.id}/${this.token}/callback`,
        "Modal payload is missing required fields",
      );
    }

    return this.rest.createInteractionResponse<JsonValue>(this.id, this.token, {
      type: InteractionResponseType.Modal,
      data: modal,
    });
  }
}

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
    const result = await this.rest.createInteractionResponse<JsonValue>(this.id, this.token, {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: { choices },
    });
    if (result.isOk()) {
      this.responded = true;
    }
    return result;
  }
}

export class MessageComponentInteraction extends ModalCapableInteraction<APIMessageComponentInteraction> {
  get customId(): string {
    return this.raw.data.custom_id;
  }

  get componentType(): ComponentType {
    return this.raw.data.component_type;
  }
}

export class ButtonInteraction extends MessageComponentInteraction {}
export class StringSelectInteraction extends MessageComponentInteraction {}
export class UserSelectInteraction extends MessageComponentInteraction {}
export class RoleSelectInteraction extends MessageComponentInteraction {}
export class MentionableSelectInteraction extends MessageComponentInteraction {}
export class ChannelSelectInteraction extends MessageComponentInteraction {}

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
