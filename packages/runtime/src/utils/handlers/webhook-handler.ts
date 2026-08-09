import type { DiscordRequestContext } from "../../types/index.js";

/** Handles Discord webhook events keyed by numeric event type. */
export class WebhookEventHandler {
  readonly handlerType = "webhook" as const;

  constructor(
    readonly eventType: number,
    private readonly handlerFn: (
      event: unknown,
      context: DiscordRequestContext,
    ) => Promise<Response | void> | Response | void,
  ) {}

  execute(
    event: unknown,
    context: DiscordRequestContext,
  ): Promise<Response | void> | Response | void {
    return this.handlerFn(event, context);
  }
}
