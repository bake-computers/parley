import type { APIUser } from "discord-api-types/v10";
import type { SlashCommand } from "./slash-command.js";
import type { ContextCommand } from "./context-command.js";
import type { ComponentHandler } from "./component-handler.js";
import type { ModalHandler } from "./modal-handler.js";
import type { WebhookEventHandler } from "./webhook-handler.js";

/**
 * A resolved guild member that may carry its associated `APIUser` object,
 * merged in from the interaction's `resolved.users` map.
 */
export type ResolvedSelectedGuildMember = Record<string, unknown> & {
  user?: APIUser;
};

/**
 * Union of all handler types that can be registered with the framework,
 * including nested arrays for organisational grouping.
 */
export type AnyHandler =
  | SlashCommand
  | ContextCommand
  | ComponentHandler
  | ModalHandler
  | WebhookEventHandler
  | readonly AnyHandler[];
