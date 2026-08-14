import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Log severity levels in ascending order of severity.
 * - `debug`: Detailed debugging information, typically only enabled during development
 * - `info`: General informational messages about application operations
 * - `warn`: Warning conditions that may indicate potential issues but are not critical
 * - `error`: Error conditions that signify a failure in a specific operation
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Represents a serialized error for logging purposes.
 * @property {string} name - The error name/type (e.g., "Error", "TypeError")
 * @property {string} message - The error message describing what went wrong
 * @property {string} stack - Optional stack trace string for debugging
 * @property {unknown} cause - Optional underlying cause of the error
 */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
}

/**
 * Additional contextual fields for log records.
 * @property {string} requestId - Unique identifier for the incoming request
 * @property {string} interactionId - Unique identifier for the interaction
 * @property {string} commandName - Name of the command being executed
 * @property {string} guildId - Discord guild/server ID
 * @property {string} userId - Discord user ID
 * @property {string} path - API or file path being accessed
 * @property {number} status - HTTP status code or operation status
 * @property {number} durationMs - Duration of the operation in milliseconds
 * @property {unknown} error - The error object if one occurred
 * @property {unknown} [key: string] - Additional custom fields
 */
export interface LogFields {
  requestId?: string;
  interactionId?: string;
  commandName?: string;
  guildId?: string;
  userId?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  error?: unknown;
  [key: string]: unknown;
}

/**
 * Complete log record combining base fields with metadata.
 * Extends {@link LogFields} with timestamp, level, event, and message.
 * @property {string} timestamp - ISO 8601 formatted timestamp
 * @property {LogLevel} level - Severity level of the log entry
 * @property {string} event - Event name/category for the log
 * @property {string} message - Human-readable log message
 */
export interface LogRecord extends LogFields {
  timestamp: string;
  level: LogLevel;
  event: string;
  message: string;
}

type LogSink = (record: LogRecord) => void;

const defaultLogSink: LogSink = (record) => {
  console.log(JSON.stringify(record));
};

let logSink: LogSink = defaultLogSink;

// Per-request sink (worker path): runWithLogSink binds a request's Axiom sink
// to the current async context so concurrent requests never share one.
const logSinkStorage = new AsyncLocalStorage<LogSink>();

/**
 * Runs fn with the given log sink bound to the current async context.
 * Concurrent requests each write to their own sink; outside the scope the
 * module sink (tests / standalone) is used.
 */
export function runWithLogSink<T>(sink: LogSink, fn: () => T): T {
  return logSinkStorage.run(sink, fn);
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...("cause" in error ? { cause: error.cause } : {}),
    };
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : JSON.stringify(error),
  };
}

function normalizeFields(fields: LogFields = {}): LogFields {
  if (!("error" in fields)) {
    return fields;
  }

  return {
    ...fields,
    error: serializeError(fields.error),
  };
}

/**
 * Sets the log sink for test environments.
 * @param {LogSink | null} sink - The log sink function, or null to reset to default (console.log JSON).
 * @returns {void}
 */
export function configureLogSink(sink: LogSink): void {
  logSink = sink;
}

export function resetLogSink(): void {
  logSink = defaultLogSink;
}

export function setLogSinkForTests(sink: LogSink | null): void {
  if (sink === null) {
    resetLogSink();
    return;
  }
  configureLogSink(sink);
}

/**
 * Core logging function that creates and dispatches a log record.
 * @param {LogLevel} level - Severity level of the log entry
 * @param {string} event - Event name/category for the log
 * @param {string} message - Human-readable log message
 * @param {LogFields} fields - Additional contextual fields
 * @returns {void}
 */
export function log(level: LogLevel, event: string, message: string, fields: LogFields = {}): void {
  const record: LogRecord = {
    timestamp: new Date().toISOString(),
    level,
    event,
    message,
    ...normalizeFields(fields),
  };

  try {
    const sink = logSinkStorage.getStore() ?? logSink;
    sink(record);
  } catch {
    console.log(JSON.stringify(record));
  }
}

/**
 * Logger object with convenience methods for each log level.
 * @property {{(event: string, message: string, fields?: LogFields) => void}} debug - Logs debug level messages
 * @property {{(event: string, message: string, fields?: LogFields) => void}} info - Logs info level messages
 * @property {{(event: string, message: string, fields?: LogFields) => void}} warn - Logs warn level messages
 * @property {{(event: string, message: string, fields?: LogFields) => void}} error - Logs error level messages
 */
export const logger = {
  debug(event: string, message: string, fields?: LogFields): void {
    log("debug", event, message, fields);
  },
  info(event: string, message: string, fields?: LogFields): void {
    log("info", event, message, fields);
  },
  warn(event: string, message: string, fields?: LogFields): void {
    log("warn", event, message, fields);
  },
  error(event: string, message: string, fields?: LogFields): void {
    log("error", event, message, fields);
  },
};
