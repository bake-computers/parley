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
import { logger } from "../logger";
import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChannelSelectInteraction,
  ChatInputCommandInteraction,
  CommandInteraction,
  MentionableSelectInteraction,
  MessageComponentInteraction,
  ModalInteraction,
  RoleSelectInteraction,
  StringSelectInteraction,
  UserSelectInteraction,
} from "./interactions";
import { DiscordRestClient } from "./rest";
import {
  ComponentHandler,
  ContextCommand,
  flattenHandlers,
  ModalHandler,
  parseCustomId,
  SlashCommand,
  WebhookEventHandler,
  type AnyHandler,
} from "./handlers";
import type {
  DiscordRequestContext,
  DiscordRuntimeEnv,
  JsonObject,
  MiddlewareFunction,
} from "./types";
import { verifyDiscordRequest } from "./verify";

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
  return isObject(value) && typeof value.type === "number";
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
    waitUntil(promise) {
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

export class DiscordBot {
  private readonly globalCommandHandlers = new Map<string, SlashCommand | ContextCommand>();
  private readonly guildCommandHandlers = new Map<string, SlashCommand | ContextCommand>();
  private readonly componentHandlers = new Map<string, ComponentHandler>();
  private readonly modalHandlers = new Map<string, ModalHandler>();
  private readonly webhookHandlers = new Map<number, WebhookEventHandler>();
  private readonly middleware: MiddlewareFunction[] = [];

  constructor(private readonly options: DiscordBotOptions = {}) {}

  loadHandlers(...handlers: AnyHandler[]): this {
    for (const handler of flattenHandlers(handlers)) {
      if (handler instanceof SlashCommand || handler instanceof ContextCommand) {
        if (handler.isGuildCommand()) {
          for (const guildId of handler.guildIds) {
            const key = `${guildId}:${handler.name}`;
            if (this.guildCommandHandlers.has(key)) {
              logger.warn("discord.handler.duplicate", "Overwriting guild command handler", {
                guildId,
                commandName: handler.name,
              });
            }
            this.guildCommandHandlers.set(key, handler);
          }
        } else {
          if (this.globalCommandHandlers.has(handler.name)) {
            logger.warn("discord.handler.duplicate", "Overwriting global command handler", {
              commandName: handler.name,
            });
          }
          this.globalCommandHandlers.set(handler.name, handler);
        }
      } else if (handler instanceof ComponentHandler) {
        if (this.componentHandlers.has(handler.prefix)) {
          logger.warn("discord.handler.duplicate", "Overwriting component handler", {
            prefix: handler.prefix,
          });
        }
        this.componentHandlers.set(handler.prefix, handler);
      } else if (handler instanceof ModalHandler) {
        if (this.modalHandlers.has(handler.prefix)) {
          logger.warn("discord.handler.duplicate", "Overwriting modal handler", {
            prefix: handler.prefix,
          });
        }
        this.modalHandlers.set(handler.prefix, handler);
      } else if (handler instanceof WebhookEventHandler) {
        if (this.webhookHandlers.has(handler.eventType)) {
          logger.warn("discord.handler.duplicate", "Overwriting webhook handler", {
            eventType: handler.eventType,
          });
        }
        this.webhookHandlers.set(handler.eventType, handler);
      }
    }
    return this;
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
      return textResponse("teamanica worker is running");
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

    executionContext.waitUntil(this.processInteraction(interaction, context));
    return jsonResponse({}, 202);
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
            interactionId: "id" in interaction ? interaction.id : undefined,
            interactionType: interaction.type,
          });
      }
    } catch (error) {
      logger.error("discord.interaction.failed", "Interaction processing failed", {
        requestId: context.requestId,
        interactionId: "id" in interaction ? interaction.id : undefined,
        error,
      });
    } finally {
      logger.debug("discord.interaction.completed", "Interaction processing completed", {
        requestId: context.requestId,
        interactionId: "id" in interaction ? interaction.id : undefined,
        durationMs: Date.now() - startedAt,
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
      logger.warn("discord.command.missing_handler", "No command handler registered", {
        requestId: context.requestId,
        interactionId: interaction.id,
        commandName,
        guildId: interaction.guild_id,
      });
      await interactionObj.reply("Unknown command.", true);
      return;
    }

    await this.runMiddleware(context, async () => {
      for (const handler of handlers) {
        try {
          if (
            handler instanceof SlashCommand &&
            interactionObj instanceof ChatInputCommandInteraction
          ) {
            await handler.execute(interactionObj);
          } else if (
            handler instanceof ContextCommand &&
            !(interactionObj instanceof ChatInputCommandInteraction)
          ) {
            await handler.execute(interactionObj);
          }
        } catch (error) {
          logger.error("discord.command.handler_failed", "Command handler failed", {
            requestId: context.requestId,
            interactionId: interaction.id,
            commandName,
            guildId: interaction.guild_id,
            error,
          });
          await this.respondToHandlerFailure(interactionObj);
        }
      }
    });
  }

  private async handleAutocompleteInteraction(
    interaction: APIApplicationCommandAutocompleteInteraction,
    rest: DiscordRestClient,
    context: DiscordRequestContext,
  ): Promise<void> {
    const interactionObj = new AutocompleteInteraction(rest, interaction, context);
    const commandName = interaction.data.name;
    context.set("autocomplete", interactionObj);

    const handler =
      (interaction.guild_id
        ? this.guildCommandHandlers.get(`${interaction.guild_id}:${commandName}`)
        : undefined) ?? this.globalCommandHandlers.get(commandName);

    if (!(handler instanceof SlashCommand)) {
      logger.warn("discord.autocomplete.missing_handler", "No autocomplete handler registered", {
        requestId: context.requestId,
        interactionId: interaction.id,
        commandName,
      });
      await interactionObj.respond([]);
      return;
    }

    await this.runMiddleware(context, async () => {
      try {
        await handler.executeAutocomplete(interactionObj);
      } catch (error) {
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
    const handler = typeof prefix === "string" ? this.componentHandlers.get(prefix) : undefined;

    if (!handler || handler.componentType !== interaction.data.component_type) {
      logger.warn("discord.component.missing_handler", "No component handler registered", {
        requestId: context.requestId,
        interactionId: interaction.id,
        prefix,
      });
      await interactionObj.reply("This component is no longer available.", true);
      return;
    }

    await this.runMiddleware(context, async () => {
      await handler.execute(interactionObj);
    });
  }

  private async handleModalInteraction(
    interaction: APIModalSubmitInteraction,
    rest: DiscordRestClient,
    context: DiscordRequestContext,
  ): Promise<void> {
    const interactionObj = new ModalInteraction(rest, interaction, context);
    const prefix = parseCustomId(interaction.data.custom_id, true);
    context.set("modal", interactionObj);
    const handler = typeof prefix === "string" ? this.modalHandlers.get(prefix) : undefined;

    if (!handler) {
      logger.warn("discord.modal.missing_handler", "No modal handler registered", {
        requestId: context.requestId,
        interactionId: interaction.id,
        prefix,
      });
      await interactionObj.reply("This form is no longer available.", true);
      return;
    }

    await this.runMiddleware(context, async () => {
      await handler.execute(interactionObj);
    });
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

    const type = verified.value.data.type;
    if (type === 1) {
      return jsonResponse({ type: 1 });
    }

    const event = isObject(verified.value.data.event) ? verified.value.data.event : null;
    const eventType = typeof event?.type === "number" ? event.type : null;
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
