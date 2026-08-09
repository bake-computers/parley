import {
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type APIApplicationCommandInteraction,
  type APIInteraction,
  type APIUser,
} from "discord-api-types/v10";
import { ok, type Result } from "../result.js";
import { logger } from "../utils/logger.js";
import { DiscordRestClient } from "../rest.js";
import type {
  DiscordApiError,
  DiscordRequestContext,
  DiscordRuntimeEnv,
  JsonObject,
  JsonValue,
} from "../types/index.js";
import { isJSONEncodable, type JSONEncodable } from "../builders/types.js";
import {
  normalizePayload,
  prepareResponsePayload,
  tryCaptureInitialResponse,
  type InteractionResponseOptions,
} from "./helpers.js";
import type { ChatInputCommandInteraction, CommandInteraction } from "./command.js";
import type { MessageComponentInteraction } from "./component.js";
import type { ModalInteraction } from "./modal.js";

type InteractionWithCommonFields = APIInteraction & {
  application_id: string;
  token: string;
  id: string;
  guild_id?: string;
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

    const responseData = prepareResponsePayload(data);
    const payload: JsonObject = {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: responseData,
    };

    if (!this.deferred && !this.replied && tryCaptureInitialResponse(this.context, payload)) {
      this.replied = true;
      return ok(payload);
    }

    if (this.deferred) {
      return this.editReply(data);
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
    const payload: JsonObject = forceEphemeral
      ? {
          type: InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: MessageFlags.Ephemeral },
        }
      : { type: InteractionResponseType.DeferredChannelMessageWithSource };

    if (this.deferred) {
      return ok(payload);
    }

    if (!this.replied && tryCaptureInitialResponse(this.context, payload)) {
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
    const payload: JsonObject = {
      type: InteractionResponseType.DeferredMessageUpdate,
    };

    if (this.deferred) {
      return Promise.resolve(ok(payload));
    }

    if (!this.replied && tryCaptureInitialResponse(this.context, payload)) {
      this.deferred = true;
      return Promise.resolve(ok(payload));
    }

    return this.rest
      .createInteractionResponse<JsonValue>(this.id, this.token, payload)
      .then((result) => {
        if (result.isOk()) {
          this.deferred = true;
        }
        return result;
      });
  }

  async editReply(
    options: string | InteractionResponseOptions,
    messageId = "@original",
  ): Promise<Result<JsonValue, DiscordApiError>> {
    const data = prepareResponsePayload(normalizePayload(options));
    const initialPayload: JsonObject = {
      type: InteractionResponseType.ChannelMessageWithSource,
      data,
    };
    if (
      !this.deferred &&
      !this.replied &&
      messageId === "@original" &&
      tryCaptureInitialResponse(this.context, initialPayload)
    ) {
      this.replied = true;
      return ok(initialPayload);
    }

    const result = await this.rest.editWebhookMessage<JsonValue>(
      this.applicationId,
      this.token,
      messageId,
      data,
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
    const payload: JsonObject = {
      type: InteractionResponseType.UpdateMessage,
      data: prepareResponsePayload(normalizePayload(options)),
    };

    if (this.deferred) {
      return this.editReply(options);
    }

    if (!this.replied && tryCaptureInitialResponse(this.context, payload)) {
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

/** Interactions that can open a modal (commands + message components). */
export class ModalCapableInteraction<
  Raw extends APIInteraction = APIInteraction,
> extends BaseInteraction<Raw> {
  showModal(data: JsonObject | JSONEncodable<JsonObject>): Promise<Result<JsonValue, DiscordApiError>> {
    const modal = isJSONEncodable(data) ? data.toJSON() : data;
    const payload: JsonObject = {
      type: InteractionResponseType.Modal,
      data: modal,
    };

    if (!this.deferred && !this.replied && tryCaptureInitialResponse(this.context, payload)) {
      this.replied = true;
      return Promise.resolve(ok(payload));
    }

    return this.rest.createInteractionResponse<JsonValue>(this.id, this.token, payload);
  }
}
