import {
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type APIApplicationCommandInteraction,
  type APIInteraction,
  type APIUser,
} from "discord-api-types/v10";
import { ok, type Result } from "neverthrow";
import { logger } from "../utils/logger.js";
import { DiscordRestClient } from "../rest.js";
import type {
  DiscordApiError,
  DiscordRequestContext,
  DiscordRuntimeEnv,
  JsonObject,
  JsonValue,
} from "../types/index.js";
import {
  normalizePayload,
  prepareResponsePayload,
  tryCaptureInitialResponse,
  type InteractionResponseOptions,
} from "./helpers.js";
import type { CommandInteraction } from "./command.js";
import type { ChatInputCommandInteraction } from "./chat-input.js";
import type { MessageComponentInteraction } from "./component.js";
import type { ModalInteraction } from "./modal.js";

type InteractionWithCommonFields = APIInteraction & {
  application_id: string;
  token: string;
  id: string;
  guild_id?: string;
  // Some contexts (like certain guild interactions) may provide channel data via
  // a lightweight object or via a flat field in the payload. To improve reliability
  // for channel resolution we also allow an optional top-level channel_id field.
  channel?: { id: string };
  channel_id?: string;
  member?: { user?: APIUser };
  user?: APIUser;
  guild_locale?: string;
};

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
    // Fall back to the legacy flat field when the channel object is missing.
    // This helps handle Discord payloads where channel_id is provided instead
    // of a populated channel object.
    return this.common.channel?.id ?? this.common.channel_id;
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

    const payload = {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: prepareResponsePayload(data),
    } satisfies JsonObject;

    if (!this.deferred && !this.replied && tryCaptureInitialResponse(this.context, payload)) {
      this.replied = true;
      return ok(payload);
    }

    const result = await this.rest.createInteractionResponse<JsonValue>(
      this.id,
      this.token,
      payload,
    );
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
    const data: JsonObject = forceEphemeral ? { flags: MessageFlags.Ephemeral } : {};
    const payload = {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data,
    } as JsonObject;

    if (!this.deferred && !this.replied && tryCaptureInitialResponse(this.context, payload)) {
      this.deferred = true;
      return ok(payload);
    }

    const result = await this.rest.createInteractionResponse<JsonValue>(
      this.id,
      this.token,
      payload,
    );
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

  deferUpdate(): Promise<Result<JsonValue, DiscordApiError>> {
    const payload = {
      type: InteractionResponseType.DeferredMessageUpdate,
    } as JsonObject;

    if (!this.deferred && !this.replied && tryCaptureInitialResponse(this.context, payload)) {
      this.deferred = true;
      return Promise.resolve(ok(payload));
    }

    return this.rest.createInteractionResponse<JsonValue>(this.id, this.token, payload);
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

  followUp(
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

  deleteReply(messageId = "@original"): Promise<Result<void, DiscordApiError>> {
    return this.rest.deleteWebhookMessage(this.applicationId, this.token, messageId);
  }

  async update(
    options: string | InteractionResponseOptions,
  ): Promise<Result<JsonValue, DiscordApiError>> {
    const payload = {
      type: InteractionResponseType.UpdateMessage,
      data: prepareResponsePayload(normalizePayload(options)),
    } as JsonObject;

    if (!this.deferred && !this.replied && tryCaptureInitialResponse(this.context, payload)) {
      this.replied = true;
      return ok(payload);
    }

    const result = await this.rest.createInteractionResponse<JsonValue>(
      this.id,
      this.token,
      payload,
    );
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
