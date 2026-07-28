import type { AxiomLogger } from "#/logger";

type RuntimeLogRecord = {
  timestamp: string;
  level: string;
  event: string;
  message: string;
  [key: string]: unknown;
};

function pickDiscordFields(
  record: RuntimeLogRecord,
): Record<string, string | number | boolean | undefined> {
  const fields: Record<string, string | number | boolean | undefined> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key === "timestamp" || key === "level" || key === "event" || key === "message") {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === undefined
    ) {
      fields[key] = value;
    }
  }

  return fields;
}

function normalizeLevel(level: string): "debug" | "info" | "warn" | "error" {
  switch (level) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return level;
    case "warning":
      return "warn";
    case "trace":
      return "debug";
    default:
      return "info";
  }
}

export function createRuntimeLogSink(axiom: AxiomLogger): (record: RuntimeLogRecord) => void {
  return (record) => {
    const fields = pickDiscordFields(record);
    const level = normalizeLevel(record.level);

    const isDiscordish =
      record.event.startsWith("discord.") ||
      record.event.startsWith("link.") ||
      typeof fields["commandName"] === "string" ||
      typeof fields["interactionId"] === "string";

    if (isDiscordish) {
      // Keep event:"error" rows for dashboards that filter on that shape.
      if (level === "error") {
        axiom.logError(
          record.event,
          record.message,
          typeof fields["path"] === "string" ? fields["path"] : undefined,
        );
      }
      axiom.log({
        event: "discord",
        service: axiom.service,
        level,
        discord_event: record.event,
        message: record.message,
        ...fields,
      });
      return;
    }

    // Explicit level so Axiom never defaults severity to info.
    axiom.logAt(level, record.message, {
      discord_event: record.event,
      ...fields,
    });
  };
}
