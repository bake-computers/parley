import type { DiscordRequestContext, MiddlewareFunction } from "@parley/discord-runtime";
import {
  INTERACTION_ANALYTICS_CONTEXT_KEY,
  writeAnalyticsDataPoint,
  type AnalyticsOutcome,
  type AnalyticsSurface,
  type InteractionAnalyticsFields,
} from "./analytics";
import type { WorkerRuntimeEnv } from "./env";

interface InteractionState {
  deferred?: boolean;
  replied?: boolean;
}

function isAnalyticsSurface(value: unknown): value is AnalyticsSurface {
  return (
    value === "slash" || value === "autocomplete" || value === "component" || value === "modal"
  );
}

function readString(context: DiscordRequestContext, key: string): string | undefined {
  const value = context.get<unknown>(key);
  return typeof value === "string" ? value : undefined;
}

function readOutcome(context: DiscordRequestContext): AnalyticsOutcome {
  const value = context.get<unknown>("analytics.outcome");
  return value === "error" || value === "invalid_message" || value === "missing_handler"
    ? value
    : "ok";
}

function readInteractionState(context: DiscordRequestContext): InteractionState {
  const command = context.get<InteractionState | undefined>("command");
  const autocomplete = context.get<InteractionState | undefined>("autocomplete");
  const component = context.get<InteractionState | undefined>("component");
  const modal = context.get<InteractionState | undefined>("modal");
  return command ?? autocomplete ?? component ?? modal ?? {};
}

export const analyticsMiddleware: MiddlewareFunction = async (context, next) => {
  const startedAt = Date.now();
  let thrown: unknown;

  try {
    await next();
  } catch (error) {
    thrown = error;
    context.set("analytics.outcome", "error");
  } finally {
    const surfaceValue = context.get<unknown>("analytics.surface");
    if (isAnalyticsSurface(surfaceValue)) {
      const fields =
        context.get<InteractionAnalyticsFields | undefined>(INTERACTION_ANALYTICS_CONTEXT_KEY) ??
        {};
      const state = readInteractionState(context);

      writeAnalyticsDataPoint(context.env as Partial<WorkerRuntimeEnv>, {
        source: "discord",
        surface: surfaceValue,
        name: readString(context, "analytics.name") ?? "unknown",
        detail: readString(context, "analytics.detail"),
        outcome: readOutcome(context),
        guildId: readString(context, "analytics.guildId"),
        userId: readString(context, "analytics.userId"),
        channelId: readString(context, "analytics.channelId"),
        cacheState: fields.cacheState,
        extraState: fields.extraState,
        durationMs: Date.now() - startedAt,
        itemCount: 1,
        deferred: Boolean(state.deferred),
        replied: Boolean(state.replied),
      });
    }
  }

  if (thrown !== undefined) {
    throw thrown;
  }
};
