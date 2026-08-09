import type { ContextCommand } from "./context-command.js";
import type { SlashCommand } from "./slash-command.js";
import type { ComponentHandler } from "./component-handler.js";
import type { ModalHandler } from "./modal-handler.js";
import type { WebhookEventHandler } from "./webhook-handler.js";
import type { AnyHandler, ConcreteHandler } from "./types.js";

function hasHandlerType(handler: unknown, type: string): boolean {
  return (
    typeof handler === "object" &&
    handler !== null &&
    "handlerType" in handler &&
    (handler as { handlerType: string }).handlerType === type
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

/** Flatten nested handler groups into concrete handler instances. */
export function flattenHandlers(handlers: readonly AnyHandler[]): ConcreteHandler[] {
  const out: ConcreteHandler[] = [];
  for (const handler of handlers) {
    if (Array.isArray(handler)) {
      out.push(...flattenHandlers(handler as readonly AnyHandler[]));
    } else {
      out.push(handler as ConcreteHandler);
    }
  }
  return out;
}

/**
 * Parses a Discord component `custom_id` of the form
 * `prefix/segment1/segment2?key=value`.
 */
export function parseCustomId(customId: string, onlyPrefix: true): string;
export function parseCustomId(
  customId: string,
  onlyPrefix?: false,
): { path: string[]; params: URLSearchParams };
export function parseCustomId(
  customId: string,
  onlyPrefix = false,
): string | { path: string[]; params: URLSearchParams } {
  if (onlyPrefix) {
    const match = customId.match(/^(.+?)(\/|\?)/iu);
    return match ? (match[1] ?? customId) : customId;
  }

  const [pathValue, paramsValue] = customId.split("?");
  return {
    path: (pathValue ?? "").split("/").filter(Boolean),
    params: new URLSearchParams(paramsValue ?? ""),
  };
}
