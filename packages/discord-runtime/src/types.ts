import type { ExecutionContext } from "@cloudflare/workers-types";
import type {
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandInteraction,
  APIApplicationCommandOptionChoice,
  APIInteraction,
  APIInteractionResponseCallbackData,
  APIMessage,
  APIModalInteractionResponseCallbackData,
  RESTAPIPartialCurrentUserGuild,
} from "discord-api-types/v10";
import type { Result } from "neverthrow";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export interface DiscordRuntimeEnv {
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_TOKEN?: string;
  DISCORD_APPLICATION_ID?: string;
  DISCORD_BOT_OWNER_ID?: string;
}

export interface DiscordRequestContext<Env = DiscordRuntimeEnv> {
  env: Env;
  executionContext: ExecutionContext;
  request: Request;
  requestId: string;
  waitUntil(promise: Promise<unknown>): void;
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T): void;
}

export interface DiscordApiError {
  kind: "discord-api";
  method: string;
  path: string;
  status?: number;
  message: string;
  retryable: boolean;
  body?: string;
  cause?: unknown;
}

export type DiscordResult<T> = Result<T, DiscordApiError>;

export type ResponseInput = string | APIInteractionResponseCallbackData;
export type ModalInput = APIModalInteractionResponseCallbackData;

export type MiddlewareFunction<Env = DiscordRuntimeEnv> = (
  context: DiscordRequestContext<Env>,
  next: () => Promise<void>,
) => Promise<void> | void;

export type CommandHandlerFunction<Interaction> = (
  interaction: Interaction,
) => Promise<void> | void;

export type AutocompleteHandlerFunction<Interaction> = (
  interaction: Interaction,
) => Promise<void> | void;

export interface CommandRegistrationData {
  name: string;
  guildIds: Set<string>;
  isGuildCommand(): boolean;
  toJSON(): JsonObject;
}

export type RegisterableCommand = CommandRegistrationData & {
  handlerType: "slash" | "context";
};

export type AnyInteraction =
  | APIInteraction
  | APIApplicationCommandInteraction
  | APIApplicationCommandAutocompleteInteraction;

export interface RegisterSummary {
  globalCommandCount: number;
  guildCommandCounts: Record<string, number>;
}

export interface RegisterOptions {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}

export type AutocompleteChoice = APIApplicationCommandOptionChoice<string | number>;

export type InteractionMessage = APIMessage;
export type PartialCurrentUserGuild = RESTAPIPartialCurrentUserGuild;
