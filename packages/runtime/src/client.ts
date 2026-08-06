import type { ExecutionContext } from "@cloudflare/workers-types";
import {
  ApplicationCommandType,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  type APIApplicationCommandAutocompleteInteraction,
  type APIApplicationCommandInteraction,
  type APIChatInputApplicationCommandInteraction,
  type APIInteraction,
  type APIMessageComponentInteraction,
  type APIModalSubmitInteraction,
} from "discord-api-types/v10";
import { logger } from "./utils/logger.js";
import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChannelSelectInteraction,
  ChatInputCommandInteraction,
  INITIAL_RESPONSE_CONTEXT_KEY,
  INITIAL_RESPONSE_RESOLVE_CONTEXT_KEY,
  CommandInteraction,
  MentionableSelectInteraction,
  MessageComponentInteraction,
  ModalInteraction,
  RoleSelectInteraction,
  StringSelectInteraction,
  UserSelectInteraction,
  type BaseInteraction,
} from "./interactions/index.js";
import { DiscordRestClient } from "./rest.js";
import {
  ComponentHandler,
  ContextCommand,
  flattenHandlers,
  isComponentHandler,
  isContextCommandHandler,
  isModalHandler,
  isSlashCommandHandler,
  isWebhookHandler,
  ModalHandler,
  parseCustomId,
  SlashCommand,
  WebhookEventHandler,
  type AnyHandler,
} from "./utils/handlers/index.js";
import type {
  DiscordRequestContext,
  DiscordRuntimeEnv,
  JsonObject,
  MiddlewareFunction,
} from "./types/index.js";
import { verifyDiscordRequest } from "./utils/verify.js";

interface DiscordBotOptions {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}

function jsonResponse(body: JsonObject, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDiscordInteraction(value: unknown): value is APIInteraction {
  return isObject(value) && typeof value["type"] === "number";
}

function readInteractionUserId(interaction: APIInteraction): string | undefined {
  if (
    "member" in interaction &&
    isObject(interaction.member) &&
    isObject(interaction.member.user)
  ) {
    const id = interaction.member.user.id;
    return typeof id === "string" ? id : undefined;
  }
  if ("user" in interaction && isObject(interaction.user)) {
    const id = interaction.user.id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function readInteractionChannelId(interaction: APIInteraction): string | undefined {
  if ("channel" in interaction && isObject(interaction.channel)) {
    const id = interaction.channel.id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function readCommandDetail(interaction: APIApplicationCommandInteraction): string {
  const options = "options" in interaction.data ? interaction.data.options : undefined;
  const first = Array.isArray(options) ? options[0] : undefined;
  if (!first || !("type" in first) || typeof first.name !== "string") {
    return "";
  }

  if (first.type === 1) {
    return first.name;
  }

  if (first.type === 2 && "options" in first && Array.isArray(first.options)) {
    const subcommand = first.options[0];
    return subcommand && typeof subcommand.name === "string"
      ? `${first.name} ${subcommand.name}`
      : first.name;
  }

  return "";
}

function readAutocompleteDetail(interaction: APIApplicationCommandAutocompleteInteraction): string {
  const visit = (options: unknown): string => {
    if (!Array.isArray(options)) {
      return "";
    }
    for (const option of options) {
      if (!isObject(option)) {
        continue;
      }
      if (option["focused"] === true && typeof option["name"] === "string") {
        return option["name"];
      }
      const nested = visit(option["options"]);
      if (nested) {
        return nested;
      }
    }
    return "";
  };

  return visit(interaction.data.options);
}

function setInteractionAnalyticsMetadata(
  context: DiscordRequestContext,
  input: {
    surface: "autocomplete" | "component" | "modal" | "slash";
    name: string;
    detail?: string;
    interaction: APIInteraction;
  },
): void {
  context.set("analytics.surface", input.surface);
  context.set("analytics.name", input.name);
  context.set("analytics.detail", input.detail ?? "");
  context.set(
    "analytics.guildId",
    "guild_id" in input.interaction ? input.interaction.guild_id : undefined,
  );
  context.set("analytics.userId", readInteractionUserId(input.interaction));
  context.set("analytics.channelId", readInteractionChannelId(input.interaction));
  context.set("analytics.outcome", "ok");
}

function createRequestContext<Env>(
  request: Request,
  env: Env,
  executionContext: ExecutionContext,
): DiscordRequestContext<Env> {
  const values = new Map<string, unknown>();
  const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();

  return {
    env,
    executionContext,
    request,
    requestId,
    waitUntil(promise: Promise<unknown>) {
      executionContext.waitUntil(promise);
    },
    get<T = unknown>(key: string): T | undefined {
      return values.get(key) as T | undefined;
    },
    set<T = unknown>(key: string, value: T): void {
      values.set(key, value);
    },
  };
}

export class ParleyClient {
  private readonly globalCommandHandlers = new Map<string, SlashCommand | ContextCommand>();
  private readonly guildCommandHandlers = new Map<string, SlashCommand | ContextCommand>();
  private readonly componentHandlers = new Map<string, ComponentHandler>();
  private readonly modalHandlers = new Map<string, ModalHandler>();
  private readonly webhookHandlers = new Map<number, WebhookEventHandler>();
  private readonly middleware: MiddlewareFunction[] = [];

  constructor(private readonly options: DiscordBotOptions = {}) {}

  loadHandlers(...handlers: AnyHandler[]): this {
    for (const handler of flattenHandlers(handlers)) {
      this.registerSingleHandler(handler);
    }
    return this;
  }

  private componentHandlerKey(prefix: string, componentType: number): string {
    return `${prefix}:${componentType}`;
  }

  private assertNoHandlerConflict<T>(
    map: Map<string | number, T>,
    key: string | number,
    handler: T,
    label: string,
    fields: Record<string, string | number>,
  ): void {
    const existing = map.get(key);
    if (existing === undefined) {
      return;
    }
    if (existing === handler) {
      return;
    }
    logger.error("discord.handler.duplicate", `Duplicate ${label} handler registration`, fields);
    throw new Error(`Duplicate ${label} handler registration for key "${key}"`);
  }

  private registerSingleHandler(handler: AnyHandler): void {
    if (isSlashCommandHandler(handler) || isContextCommandHandler(handler)) {
      if (handler.isGuildCommand()) {
        for (const guildId of handler.guildIds) {
          const key = `${guildId}:${handler.name}`;
          this.assertNoHandlerConflict(this.guildCommandHandlers, key, handler, "guild command", {
            guildId,
            commandName: handler.name,
          });
          this.guildCommandHandlers.set(key, handler);
        }
      } else {
        this.assertNoHandlerConflict(
          this.globalCommandHandlers,
          handler.name,
          handler,
          "global command",
          { commandName: handler.name },
        );
        this.globalCommandHandlers.set(handler.name, handler);
      }
    } else if (isComponentHandler(handler)) {
      const key = this.componentHandlerKey(handler.prefix, handler.componentType);
      this.assertNoHandlerConflict(this.componentHandlers, key, handler, "component", {
        prefix: handler.prefix,
        componentType: handler.componentType,
      });
      this.componentHandlers.set(key, handler);
    } else if (isModalHandler(handler)) {
      this.assertNoHandlerConflict(this.modalHandlers, handler.prefix, handler, "modal", {
        prefix: handler.prefix,
      });
      this.modalHandlers.set(handler.prefix, handler);
    } else if (isWebhookHandler(handler)) {
      this.assertNoHandlerConflict(this.webhookHandlers, handler.eventType, handler, "webhook", {
        eventType: handler.eventType,
      });
      this.webhookHandlers.set(handler.eventType, handler);
    }
  }

  use(...middleware: MiddlewareFunction[]): this {
    this.middleware.push(...middleware);
    return this;
  }

  async fetch<Env extends object>(
    request: Request,
    env: Env,
    executionContext: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const runtimeEnv = env as DiscordRuntimeEnv;
    const context = createRequestContext(request, runtimeEnv, executionContext);

    if (request.method === "GET") {
      return textResponse("parley worker is running");
    }

    if (request.method !== "POST") {
      return textResponse("Method not allowed", 405);
    }

    if (url.pathname === "/webhook") {
      return this.handleWebhookRequest(request, runtimeEnv, context);
    }

    if (url.pathname !== "/" && url.pathname !== "/interactions") {
      return textResponse("Not found", 404);
    }

    const verified = await verifyDiscordRequest(request, runtimeEnv.DISCORD_PUBLIC_KEY);
    if (verified.isErr()) {
      logger.warn("discord.request.invalid", "Rejected Discord interaction request", {
        requestId: context.requestId,
        path: url.pathname,
        error: verified.error,
      });
      return textResponse("Bad request signature.", 401);
    }

    if (!isDiscordInteraction(verified.value.data)) {
      logger.warn("discord.request.invalid_body", "Discord request body is not an interaction", {
        requestId: context.requestId,
      });
      return textResponse("Invalid interaction body.", 400);
    }

    const interaction = verified.value.data;
    if (interaction.type === InteractionType.Ping) {
      logger.info("discord.ping", "Received Discord ping", { requestId: context.requestId });
      return jsonResponse({ type: InteractionResponseType.Pong });
    }

    const initialResponse = new Promise<JsonObject | null>((resolve) => {
      context.set(INITIAL_RESPONSE_RESOLVE_CONTEXT_KEY, resolve);
    });
    const processing = this.processInteraction(interaction, context).finally(() => {
      const response = context.get<JsonObject | undefined>(INITIAL_RESPONSE_CONTEXT_KEY) ?? null;
      const resolver = context.get<((response: JsonObject | null) => void) | undefined>(
        INITIAL_RESPONSE_RESOLVE_CONTEXT_KEY,
      );
      if (resolver) {
        context.set(INITIAL_RESPONSE_RESOLVE_CONTEXT_KEY, undefined);
        resolver(response);
      }
    });

    const response = await initialResponse;

    executionContext.waitUntil(processing);
    if (response) {
      const responseType = response["type"];
      logger.info("discord.interaction.ack", "Interaction acknowledged", {
        requestId: context.requestId,
        interactionType: interaction.type,
        responseType: typeof responseType === "number" ? responseType : undefined,
        surface: context.get<string | undefined>("analytics.surface"),
        name: context.get<string | undefined>("analytics.name"),
        outcome: context.get<string | undefined>("analytics.outcome"),
        ...("id" in interaction ? { interactionId: interaction.id } : {}),
      });
      return jsonResponse(response);
    }

    logger.error("discord.interaction.empty_response", "Interaction returned no callback payload", {
      requestId: context.requestId,
      interactionType: interaction.type,
      surface: context.get<string | undefined>("analytics.surface"),
      name: context.get<string | undefined>("analytics.name"),
      outcome: context.get<string | undefined>("analytics.outcome"),
      ...("id" in interaction ? { interactionId: interaction.id } : {}),
    });
    return new Response(null, { status: 204 });
  }

  private async runMiddleware(
    context: DiscordRequestContext,
    finalHandler: () => Promise<void>,
  ): Promise<void> {
    const dispatch = async (index: number): Promise<void> => {
      const middleware = this.middleware[index];
      if (!middleware) {
        await finalHandler();
        return;
      }
      await middleware(context, () => dispatch(index + 1));
    };
    await dispatch(0);
  }

  private createRest(env: DiscordRuntimeEnv): DiscordRestClient {
    return new DiscordRestClient(
      env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN,
      this.options.fetcher,
      this.options.apiBaseUrl,
    );
  }

  private async processInteraction(
    interaction: APIInteraction,
    context: DiscordRequestContext,
  ): Promise<void> {
    const rest = this.createRest(context.env);
    const startedAt = Date.now();

    try {
      switch (interaction.type) {
        case InteractionType.ApplicationCommand:
          await this.handleCommandInteraction(interaction, rest, context);
          break;
        case InteractionType.ApplicationCommandAutocomplete:
          await this.handleAutocompleteInteraction(interaction, rest, context);
          break;
        case InteractionType.MessageComponent:
          await this.handleComponentInteraction(interaction, rest, context);
          break;
        case InteractionType.ModalSubmit:
          await this.handleModalInteraction(interaction, rest, context);
          break;
        default:
          logger.warn("discord.interaction.unsupported", "Unsupported interaction type", {
            requestId: context.requestId,
            ...("id" in interaction ? { interactionId: interaction.id } : {}),
            interactionType: interaction.type,
          });
      }
    } catch (error) {
      logger.error("discord.interaction.failed", "Interaction processing failed", {
        requestId: context.requestId,
        ...("id" in interaction ? { interactionId: interaction.id } : {}),
        error,
      });
    } finally {
      const outcome = context.get<string | undefined>("analytics.outcome");
      const level = outcome === "error" || outcome === "missing_handler" ? "warn" : "info";
      logger[level]("discord.interaction.completed", "Interaction processing completed", {
        requestId: context.requestId,
        interactionType: interaction.type,
        surface: context.get<string | undefined>("analytics.surface"),
        name: context.get<string | undefined>("analytics.name"),
        outcome,
        durationMs: Date.now() - startedAt,
        ...("id" in interaction ? { interactionId: interaction.id } : {}),
      });
    }
  }

  private async handleCommandInteraction(
    interaction: APIApplicationCommandInteraction,
    rest: DiscordRestClient,
    context: DiscordRequestContext,
  ): Promise<void> {
    const interactionObj =
      interaction.data.type === ApplicationCommandType.ChatInput
        ? new ChatInputCommandInteraction(
            rest,
            interaction as APIChatInputApplicationCommandInteraction,
            context,
          )
        : new CommandInteraction(rest, interaction, context);
    const commandName = interaction.data.name;
    context.set("command", interactionObj);
    setInteractionAnalyticsMetadata(context, {
      surface: "slash",
      name: commandName,
      detail: readCommandDetail(interaction),
      interaction,
    });

    const handlers: (SlashCommand | ContextCommand)[] = [];
    const globalHandler = this.globalCommandHandlers.get(commandName);
    if (globalHandler) {
      handlers.push(globalHandler);
    }
    if (interaction.guild_id) {
      const guildHandler = this.guildCommandHandlers.get(`${interaction.guild_id}:${commandName}`);
      if (guildHandler) {
        handlers.push(guildHandler);
      }
    }

    if (handlers.length === 0) {
      context.set("analytics.outcome", "missing_handler");
      logger.warn("discord.command.missing_handler", "No command handler registered", {
        requestId: context.requestId,
        interactionId: interaction.id,
        commandName,
        ...(interaction.guild_id ? { guildId: interaction.guild_id } : {}),
      });
      const cancelAutomaticAcknowledgement = this.scheduleAutomaticAcknowledgement(
        interactionObj,
        "reply",
      );
      try {
        await this.runMiddleware(context, async () => {
          await interactionObj.reply("Unknown command.", true);
        });
      } finally {
        cancelAutomaticAcknowledgement();
      }
      return;
    }

    const cancelAutomaticAcknowledgement = this.scheduleAutomaticAcknowledgement(
      interactionObj,
      "reply",
    );
    try {
      await this.runMiddleware(context, async () => {
        for (const handler of handlers) {
          try {
            if (
              isSlashCommandHandler(handler) &&
              interactionObj instanceof ChatInputCommandInteraction
            ) {
              // eslint-disable-next-line no-await-in-loop -- handlers must execute sequentially
              await handler.execute(interactionObj);
            } else if (
              isContextCommandHandler(handler) &&
              !(interactionObj instanceof ChatInputCommandInteraction)
            ) {
              // eslint-disable-next-line no-await-in-loop -- handlers must execute sequentially
              await handler.execute(interactionObj);
            }
          } catch (error) {
            context.set("analytics.outcome", "error");
            logger.error("discord.command.handler_failed", "Command handler failed", {
              requestId: context.requestId,
              interactionId: interaction.id,
              commandName,
              ...(interaction.guild_id ? { guildId: interaction.guild_id } : {}),
              error,
            });
            // eslint-disable-next-line no-await-in-loop -- handlers must execute sequentially
            await this.respondToHandlerFailure(interactionObj);
          }
        }
      });
    } finally {
      cancelAutomaticAcknowledgement();
    }
  }

  private scheduleAutomaticAcknowledgement(
    interaction: BaseInteraction,
    mode: "reply" | "update",
  ): () => void {
    const timer = setTimeout(() => {
      if (interaction.replied || interaction.deferred) {
        return;
      }

      const acknowledgement =
        mode === "reply" ? interaction.deferReply(true) : interaction.deferUpdate();
      void acknowledgement.catch((error: unknown) => {
        logger.error(
          "discord.interaction.auto_ack_failed",
          "Automatic interaction acknowledgement failed",
          {
            interactionId: interaction.id,
            error,
          },
        );
      });
    }, 200);

    return () => clearTimeout(timer);
  }

  private async handleAutocompleteInteraction(
    interaction: APIApplicationCommandAutocompleteInteraction,
    rest: DiscordRestClient,
    context: DiscordRequestContext,
  ): Promise<void> {
    const interactionObj = new AutocompleteInteraction(rest, interaction, context);
    const commandName = interaction.data.name;
    context.set("autocomplete", interactionObj);
    setInteractionAnalyticsMetadata(context, {
      surface: "autocomplete",
      name: commandName,
      detail: readAutocompleteDetail(interaction),
      interaction,
    });

    const handler =
      (interaction.guild_id
        ? this.guildCommandHandlers.get(`${interaction.guild_id}:${commandName}`)
        : undefined) ?? this.globalCommandHandlers.get(commandName);

    if (!isSlashCommandHandler(handler)) {
      context.set("analytics.outcome", "missing_handler");
      logger.warn("discord.autocomplete.missing_handler", "No autocomplete handler registered", {
        requestId: context.requestId,
        interactionId: interaction.id,
        commandName,
      });
      await this.runMiddleware(context, async () => {
        await interactionObj.respond([]);
      });
      return;
    }

    await this.runMiddleware(context, async () => {
      try {
        await handler.executeAutocomplete(interactionObj);
      } catch (error) {
        context.set("analytics.outcome", "error");
        logger.error("discord.autocomplete.handler_failed", "Autocomplete handler failed", {
          requestId: context.requestId,
          interactionId: interaction.id,
          commandName,
          error,
        });
        if (!interactionObj.responded) {
          await interactionObj.respond([]);
        }
      }
    });
  }

  private createMessageComponentInteraction(
    interaction: APIMessageComponentInteraction,
    rest: DiscordRestClient,
    context: DiscordRequestContext,
  ): MessageComponentInteraction {
    switch (interaction.data.component_type) {
      case ComponentType.Button:
        return new ButtonInteraction(rest, interaction, context);
      case ComponentType.StringSelect:
        return new StringSelectInteraction(rest, interaction, context);
      case ComponentType.UserSelect:
        return new UserSelectInteraction(rest, interaction, context);
      case ComponentType.RoleSelect:
        return new RoleSelectInteraction(rest, interaction, context);
      case ComponentType.MentionableSelect:
        return new MentionableSelectInteraction(rest, interaction, context);
      case ComponentType.ChannelSelect:
        return new ChannelSelectInteraction(rest, interaction, context);
      default:
        return new MessageComponentInteraction(rest, interaction, context);
    }
  }

  private async handleComponentInteraction(
    interaction: APIMessageComponentInteraction,
    rest: DiscordRestClient,
    context: DiscordRequestContext,
  ): Promise<void> {
    const interactionObj = this.createMessageComponentInteraction(interaction, rest, context);
    const prefix = parseCustomId(interaction.data.custom_id, true);
    context.set("component", interactionObj);
    setInteractionAnalyticsMetadata(context, {
      surface: "component",
      name: typeof prefix === "string" ? prefix : "unknown",
      interaction,
    });
    const handler =
      typeof prefix === "string"
        ? this.componentHandlers.get(
            this.componentHandlerKey(prefix, interaction.data.component_type),
          )
        : undefined;

    if (!handler) {
      context.set("analytics.outcome", "missing_handler");
      logger.warn("discord.component.missing_handler", "No component handler registered", {
        requestId: context.requestId,
        interactionId: interaction.id,
        prefix,
      });
      await this.runMiddleware(context, async () => {
        await interactionObj.reply("This component is no longer available.", true);
      });
      return;
    }

    const cancelAutomaticAcknowledgement = this.scheduleAutomaticAcknowledgement(
      interactionObj,
      "update",
    );
    try {
      await this.runMiddleware(context, async () => {
        await handler.execute(interactionObj);
      });
    } finally {
      cancelAutomaticAcknowledgement();
    }
  }

  private async handleModalInteraction(
    interaction: APIModalSubmitInteraction,
    rest: DiscordRestClient,
    context: DiscordRequestContext,
  ): Promise<void> {
    const interactionObj = new ModalInteraction(rest, interaction, context);
    const prefix = parseCustomId(interaction.data.custom_id, true);
    context.set("modal", interactionObj);
    setInteractionAnalyticsMetadata(context, {
      surface: "modal",
      name: typeof prefix === "string" ? prefix : "unknown",
      interaction,
    });
    const handler = typeof prefix === "string" ? this.modalHandlers.get(prefix) : undefined;

    if (!handler) {
      context.set("analytics.outcome", "missing_handler");
      logger.warn("discord.modal.missing_handler", "No modal handler registered", {
        requestId: context.requestId,
        interactionId: interaction.id,
        prefix,
      });
      await this.runMiddleware(context, async () => {
        await interactionObj.reply("This form is no longer available.", true);
      });
      return;
    }

    const cancelAutomaticAcknowledgement = this.scheduleAutomaticAcknowledgement(
      interactionObj,
      "reply",
    );
    try {
      await this.runMiddleware(context, async () => {
        await handler.execute(interactionObj);
      });
    } finally {
      cancelAutomaticAcknowledgement();
    }
  }

  private async respondToHandlerFailure(
    interaction: CommandInteraction | ChatInputCommandInteraction,
  ): Promise<void> {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("Something went wrong while handling this command.");
      return;
    }
    await interaction.reply("Something went wrong while handling this command.", true);
  }

  private async handleWebhookRequest<Env extends DiscordRuntimeEnv>(
    request: Request,
    env: Env,
    context: DiscordRequestContext<Env>,
  ): Promise<Response> {
    const verified = await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY);
    if (verified.isErr()) {
      return textResponse("Bad request signature.", 401);
    }

    if (!isObject(verified.value.data)) {
      return textResponse("Invalid webhook body.", 400);
    }

    const type = verified.value.data["type"];
    if (type === 1) {
      return jsonResponse({ type: 1 });
    }

    const event = isObject(verified.value.data["event"]) ? verified.value.data["event"] : null;
    const eventType = typeof event?.["type"] === "number" ? event["type"] : null;
    if (eventType === null) {
      return textResponse("Invalid webhook event.", 400);
    }

    const handler = this.webhookHandlers.get(eventType);
    if (!handler) {
      return textResponse("No handler found for this event type.", 404);
    }

    context.waitUntil(
      Promise.resolve(handler.execute(event, context)).catch((error: unknown) => {
        logger.error("discord.webhook.handler_failed", "Webhook handler failed", {
          requestId: context.requestId,
          eventType,
          error,
        });
      }),
    );
    return jsonResponse({ ok: true });
  }
}
