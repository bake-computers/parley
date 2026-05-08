import type { DiscordRequestContext } from "../../types/index.js";

/**
 * Handles Discord webhook events of a specific numeric event type (e.g.
 * application-authorised, entitlement-created).
 *
 * Unlike the interaction-based handlers, this class does not extend any builder
 * and has no prefix matching — it is keyed purely on {@link eventType}.
 */
export class WebhookEventHandler {
  /** Discriminant used to identify this handler type at runtime. */
  readonly handlerType = "webhook" as const;

  /**
   * @param {number} eventType - The numeric Discord webhook event type this handler processes.
   * @param {(event: unknown, context: DiscordRequestContext) => Promise<Response | void> | Response | void} handlerFn - The function invoked when a matching event arrives. May
   *   return a custom `Response` to override the default acknowledgement, or
   *   `void` to let the framework respond.
   */
  constructor(
    readonly eventType: number,
    private readonly handlerFn: (
      event: unknown,
      context: DiscordRequestContext,
    ) => Promise<Response | void> | Response | void,
  ) {}

  /**
   * Invokes the handler with the given event payload and request context.
   *
   * @param {unknown} event - The raw webhook event payload.
   * @param {DiscordRequestContext} context - The surrounding Discord request context.
   * @returns {Promise<Response | void> | Response | void} A custom `Response` if the handler returns one, otherwise `void`.
   */
  execute(
    event: unknown,
    context: DiscordRequestContext,
  ): Promise<Response | void> | Response | void {
    return this.handlerFn(event, context);
  }
}
