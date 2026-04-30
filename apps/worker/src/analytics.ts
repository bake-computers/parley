import type { DiscordRequestContext } from "@parley/discord-runtime";
import type { WorkerRuntimeEnv } from "./env";

export const INTERACTION_ANALYTICS_CONTEXT_KEY = "analytics.interaction.fields";

export type AnalyticsSource = "discord" | "worker";
export type AnalyticsSurface =
  | "autocomplete"
  | "component"
  | "modal"
  | "queue"
  | "scheduled"
  | "slash";
export type AnalyticsOutcome = "error" | "invalid_message" | "missing_handler" | "ok";
export type AnalyticsCacheState = "hit" | "miss" | "none" | "stale";

export interface InteractionAnalyticsFields {
  cacheState?: AnalyticsCacheState;
  extraState?: string;
}

interface BaseAnalyticsEvent {
  source: AnalyticsSource;
  surface: AnalyticsSurface;
  name: string;
  detail?: string | null;
  outcome?: AnalyticsOutcome;
  guildId?: string | null;
  userId?: string | null;
  channelId?: string | null;
  cacheState?: string | null;
  extraState?: string | null;
  durationMs?: number;
  itemCount?: number;
  successCount?: number;
  errorCount?: number;
  deferred?: boolean;
  replied?: boolean;
}

export interface InteractionAnalyticsEvent extends BaseAnalyticsEvent {
  source: "discord";
  surface: "autocomplete" | "component" | "modal" | "slash";
}

export interface QueueAnalyticsSummary extends BaseAnalyticsEvent {
  source: "worker";
  surface: "queue";
}

export interface ScheduledAnalyticsSummary extends BaseAnalyticsEvent {
  source: "worker";
  surface: "scheduled";
}

function normalizeString(value: string | null | undefined, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function normalizeNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function samplingKey(event: BaseAnalyticsEvent): string {
  if (event.surface === "queue") {
    return `queue:${normalizeString(event.name, "unknown")}`;
  }
  if (event.surface === "scheduled") {
    return `scheduled:${normalizeString(event.name, "unknown")}`;
  }
  return `${normalizeString(event.guildId, "dm")}:${event.surface}:${normalizeString(event.name, "unknown")}`;
}

export function writeAnalyticsDataPoint(
  env: Partial<Pick<WorkerRuntimeEnv, "ANALYTICS_ENGINE">> | null | undefined,
  event: BaseAnalyticsEvent,
): void {
  const dataset = env?.ANALYTICS_ENGINE;
  if (!dataset) {
    return;
  }

  const outcome = event.outcome ?? "ok";
  const errorCount = event.errorCount ?? (outcome === "ok" ? 0 : 1);
  const successCount = event.successCount ?? (outcome === "ok" ? 1 : 0);

  try {
    dataset.writeDataPoint({
      indexes: [samplingKey(event)],
      blobs: [
        event.source,
        event.surface,
        normalizeString(event.name),
        normalizeString(event.detail),
        outcome,
        normalizeString(event.guildId, "dm"),
        normalizeString(event.userId),
        normalizeString(event.channelId),
        normalizeString(event.cacheState, "none"),
        normalizeString(event.extraState, "none"),
      ],
      doubles: [
        normalizeNumber(event.durationMs),
        normalizeNumber(event.itemCount ?? 1),
        normalizeNumber(successCount),
        normalizeNumber(errorCount),
        event.deferred ? 1 : 0,
        event.replied ? 1 : 0,
      ],
    });
  } catch {
    // Analytics must never affect command, queue, or scheduled execution.
  }
}

export function setInteractionAnalyticsContext(
  context: DiscordRequestContext,
  fields: InteractionAnalyticsFields,
): void {
  context.set(INTERACTION_ANALYTICS_CONTEXT_KEY, fields);
}

export function mergeInteractionAnalyticsContext(
  context: DiscordRequestContext,
  fields: InteractionAnalyticsFields,
): void {
  const existing =
    context.get<InteractionAnalyticsFields | undefined>(INTERACTION_ANALYTICS_CONTEXT_KEY) ?? {};
  context.set(INTERACTION_ANALYTICS_CONTEXT_KEY, {
    ...existing,
    ...fields,
  });
}
