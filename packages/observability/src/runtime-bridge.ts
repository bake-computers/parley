import type { EventLogger } from "#/logger";
import type { WideEvent } from "#/events";

type RuntimeLogRecord = {
  timestamp: string;
  level: string;
  event: string;
  message: string;
  surface?: unknown;
  name?: unknown;
  commandName?: unknown;
  detail?: unknown;
  interactionId?: unknown;
  guildId?: unknown;
  userId?: unknown;
  channelId?: unknown;
  interactionType?: unknown;
  durationMs?: unknown;
  outcome?: unknown;
  requestId?: unknown;
  error?: unknown;
  path?: unknown;
  [key: string]: unknown;
};

/**
 * Records that terminate the current request event: the sink finishes the
 * wide event and flushes (these are the canonical worker emits).
 */
const TERMINAL_EVENTS = new Set([
  "discord.request.invalid",
  "discord.request.invalid_body",
  "discord.interaction.ping",
  "discord.interaction.empty_response",
  "discord.interaction.completed",
]);

function normalizeLevel(level: string): "info" | "warn" | "error" {
  switch (level) {
    case "warn":
    case "warning":
      return "warn";
    case "error":
      return "error";
    default:
      return "info";
  }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** warn → client_error, error → error, explicit record outcome mapped otherwise. */
function mapOutcome(record: RuntimeLogRecord): WideEvent["outcome"] | undefined {
  const level = normalizeLevel(record.level);
  if (level === "error") {
    return "error";
  }
  if (level === "warn") {
    return "client_error";
  }
  if (record["outcome"] === "error") {
    return "error";
  }
  if (record["outcome"] === "missing_handler") {
    return "client_error";
  }
  if (record["outcome"] === "ok") {
    return "success";
  }
  return undefined;
}

function mapError(record: RuntimeLogRecord): WideEvent["error"] | undefined {
  const raw = record.error;
  let message: string | undefined;
  let type: string | undefined;
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const err = raw as { name?: unknown; message?: unknown };
    if (typeof err.message === "string") {
      message = err.message;
    }
    if (typeof err.name === "string" && err.name !== "Error" && err.name !== "UnknownError") {
      type = err.name;
    }
  } else if (typeof raw === "string" && raw !== "") {
    message = raw;
  }
  if (message === undefined) {
    if (normalizeLevel(record.level) !== "error") {
      return undefined;
    }
    message = record.message;
  }
  return { ...(type ? { type } : {}), message, code: record.event };
}

function mapDiscord(record: RuntimeLogRecord): WideEvent["discord"] | undefined {
  const out: NonNullable<WideEvent["discord"]> = {};
  let found = false;
  const surface = str(record.surface);
  const name = str(record.commandName) ?? str(record.name);
  const detail = str(record.detail);
  const interactionId = str(record.interactionId);
  const guildId = str(record.guildId);
  const userId = str(record.userId);
  const channelId = str(record.channelId);
  const interactionType = num(record.interactionType);
  if (surface) {
    out.surface = surface;
    found = true;
  }
  if (name) {
    out.name = name;
    found = true;
  }
  if (detail) {
    out.detail = detail;
    found = true;
  }
  if (interactionId) {
    out.interaction_id = interactionId;
    found = true;
  }
  if (guildId) {
    out.guild_id = guildId;
    found = true;
  }
  if (userId) {
    out.user_id = userId;
    found = true;
  }
  if (channelId) {
    out.channel_id = channelId;
    found = true;
  }
  if (interactionType !== undefined) {
    out.interaction_type = interactionType;
    found = true;
  }
  return found ? out : undefined;
}

function errorMessage(record: RuntimeLogRecord): string | undefined {
  const raw = record.error;
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const message = (raw as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  if (typeof raw === "string" && raw !== "") {
    return raw;
  }
  return undefined;
}

function buildMessage(record: RuntimeLogRecord, outcome: WideEvent["outcome"] | undefined): string {
  const surface = str(record.surface);
  const name = str(record.commandName) ?? str(record.name);
  const errMsg = errorMessage(record);

  if (record.event === "discord.interaction.completed") {
    if (surface && name) {
      const failed = outcome === "error" || outcome === "client_error";
      return failed
        ? `${surface} ${name} failed${errMsg ? `: ${errMsg}` : ""}`
        : `${surface} ${name} completed`;
    }
    return record.message;
  }

  if (
    (record.event === "discord.request.invalid" || record.event === "discord.request.invalid_body") &&
    errMsg &&
    !record.message.includes(errMsg)
  ) {
    return `${record.message}: ${errMsg}`;
  }

  if (normalizeLevel(record.level) === "error" && errMsg && !record.message.includes(errMsg)) {
    return `${record.message}: ${errMsg}`;
  }
  return record.message;
}

/**
 * Bridges the runtime logger into the in-flight wide event: no current event →
 * standalone emit; otherwise merge the record and finish+flush on terminal
 * events only. Never emits a second event:error/discord pair. When waitUntil is
 * provided the flush promise is handed to it so the stream send is covered.
 */
export function createRuntimeLogSink(
  logger: EventLogger,
  waitUntil?: (promise: Promise<unknown>) => void,
): (record: RuntimeLogRecord) => void {
  const flush = (): void => {
    const flushed = logger.flush();
    if (waitUntil) {
      waitUntil(flushed);
    } else {
      void flushed;
    }
  };

  return (record) => {
    // The /webhook HTTP hop is finished by middleware as a 200; a handler
    // failure arrives later in waitUntil, so report it standalone (request_id
    // copied) instead of merging into the finished event where it would be lost.
    if (record.event === "discord.webhook.handler_failed") {
      const requestId = str(record.requestId);
      const error = mapError(record);
      logger.emitStandalone({
        ts: record.timestamp,
        level: "error",
        event: record.event,
        message: buildMessage(record, "error"),
        where: `${logger.service} discord webhook`,
        ...(requestId ? { request_id: requestId } : {}),
        ...(error ? { error } : {}),
      });
      flush();
      return;
    }

    if (!logger.hasCurrent) {
      logger.emitStandalone({
        ts: record.timestamp,
        level: normalizeLevel(record.level) === "error" ? "error" : "info",
        event: record.event,
        message: record.message,
      });
      flush();
      return;
    }

    const terminal = TERMINAL_EVENTS.has(record.event);
    const outcome = mapOutcome(record);
    const error = mapError(record);
    const discord = mapDiscord(record);
    const where = discord?.name
      ? `${logger.service} ${discord.surface ?? "discord"} ${discord.name}`
      : discord
        ? `${logger.service} discord ${record.event}`
        : undefined;
    const requestId = str(record.requestId);
    const durationMs = num(record.durationMs);

    logger.merge({
      ...(terminal ? { event: record.event } : {}),
      message: buildMessage(record, outcome),
      ...(where ? { where } : {}),
      ...(requestId ? { request_id: requestId } : {}),
      ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
      ...(outcome ? { outcome } : {}),
      ...(discord ? { discord } : {}),
      ...(error ? { error } : {}),
    });

    if (terminal) {
      logger.finish();
      flush();
    }
  };
}
