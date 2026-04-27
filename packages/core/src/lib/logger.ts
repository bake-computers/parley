export type LogLevel = "debug" | "info" | "warn" | "error";

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
}

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

export interface LogRecord extends LogFields {
  timestamp: string;
  level: LogLevel;
  event: string;
  message: string;
}

type LogSink = (record: LogRecord) => void;

let logSink: LogSink = (record) => {
  console.log(JSON.stringify(record));
};

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

export function setLogSinkForTests(sink: LogSink | null): void {
  logSink =
    sink ??
    ((record) => {
      console.log(JSON.stringify(record));
    });
}

export function log(level: LogLevel, event: string, message: string, fields: LogFields = {}): void {
  const record: LogRecord = {
    timestamp: new Date().toISOString(),
    level,
    event,
    message,
    ...normalizeFields(fields),
  };

  try {
    logSink(record);
  } catch {
    console.log(JSON.stringify(record));
  }
}

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
