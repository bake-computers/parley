import type { APIApplicationCommandOptionChoice } from "discord-api-types/v10";
import type { ContextCommand } from "./context-command.js";
import type { SlashCommand } from "./slash-command.js";
import type { ComponentHandler } from "./component-handler.js";
import type { ModalHandler } from "./modal-handler.js";
import type { WebhookEventHandler } from "./webhook-handler.js";
import type { AnyHandler } from "./types.js";

function hasHandlerType(handler: unknown, handlerType: string): boolean {
  return (
    typeof handler === "object" &&
    handler !== null &&
    "handlerType" in handler &&
    (handler as { handlerType: string }).handlerType === handlerType
  );
}

export function isSlashCommandHandler(handler: unknown): handler is SlashCommand {
  return hasHandlerType(handler, "slash");
}

export function isContextCommandHandler(handler: unknown): handler is ContextCommand {
  return hasHandlerType(handler, "context");
}

export function isComponentHandler(handler: unknown): handler is ComponentHandler {
  return hasHandlerType(handler, "component");
}

export function isModalHandler(handler: unknown): handler is ModalHandler {
  return hasHandlerType(handler, "modal");
}

export function isWebhookHandler(handler: unknown): handler is WebhookEventHandler {
  return hasHandlerType(handler, "webhook");
}

export function isRegisterableApplicationCommand(
  handler: unknown,
): handler is SlashCommand | ContextCommand {
  return isSlashCommandHandler(handler) || isContextCommandHandler(handler);
}

/**
 * Recursively flattens a (possibly nested) array of {@link AnyHandler} values
 * into a flat array of concrete handler instances.
 *
 * Nesting is purely organisational — all handlers are equivalent once flattened.
 *
 * @param {readonly AnyHandler[]} handlers - A (possibly nested) list of handlers.
 * @returns {(SlashCommand | ContextCommand | ComponentHandler | ModalHandler | WebhookEventHandler)[]} A flat array containing every concrete handler.
 *
 * @example
 * ```ts
 * const allHandlers = flattenHandlers([
 *   ping,
 *   [userCommands, messageCommands],
 *   componentHandlers,
 * ]);
 * ```
 */
export function flattenHandlers(
  handlers: readonly AnyHandler[],
): (SlashCommand | ContextCommand | ComponentHandler | ModalHandler | WebhookEventHandler)[] {
  return handlers.flatMap((handler) =>
    Array.isArray(handler)
      ? flattenHandlers(handler as readonly AnyHandler[])
      : [
          handler as
            | SlashCommand
            | ContextCommand
            | ComponentHandler
            | ModalHandler
            | WebhookEventHandler,
        ],
  );
}

/**
 * Creates a typed autocomplete choice object for use in autocomplete responses.
 *
 * @param {string} name - The display label shown to the user in the Discord UI.
 * @param {T} value - The value submitted to the command when this choice is selected.
 * @returns {APIApplicationCommandOptionChoice<T>} An `APIApplicationCommandOptionChoice` with the given name and value.
 *
 * @example
 * ```ts
 * await interaction.respond([
 *   autocompleteChoice("Red",   "red"),
 *   autocompleteChoice("Green", "green"),
 *   autocompleteChoice("Blue",  "blue"),
 * ]);
 * ```
 */
export function autocompleteChoice<T extends string | number>(
  name: string,
  value: T,
): APIApplicationCommandOptionChoice<T> {
  return { name, value };
}
