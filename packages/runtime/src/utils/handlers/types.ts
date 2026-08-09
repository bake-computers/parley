import type { APIUser } from "discord-api-types/v10";
import type { SlashCommand } from "./slash-command.js";
import type { ContextCommand } from "./context-command.js";
import type { ComponentHandler } from "./component-handler.js";
import type { ModalHandler } from "./modal-handler.js";
import type { WebhookEventHandler } from "./webhook-handler.js";

/** Resolved guild member, optionally with its associated `APIUser`. */
export type ResolvedSelectedGuildMember = Record<string, unknown> & {
  user?: APIUser;
};

/** Concrete handler instances (no nesting). */
export type ConcreteHandler =
  | SlashCommand
  | ContextCommand
  | ComponentHandler
  | ModalHandler
  | WebhookEventHandler;

/** Handler union including nested arrays for organisational grouping. */
export type AnyHandler = ConcreteHandler | readonly AnyHandler[];
