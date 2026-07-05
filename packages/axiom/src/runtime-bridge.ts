import type { AxiomLogger } from "./logger.js";

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

export function createRuntimeLogSink(axiom: AxiomLogger): (record: RuntimeLogRecord) => void {
  return (record) => {
    const fields = pickDiscordFields(record);

    if (record.level === "error") {
      axiom.logError(
        record.event,
        record.message,
        typeof fields["path"] === "string" ? fields["path"] : undefined,
      );
      axiom.log({
        event: "discord",
        service: axiom.service,
        level: record.level,
        discord_event: record.event,
        message: record.message,
        ...fields,
      });
      return;
    }

    if (record.level === "warn") {
      axiom.log({
        event: "discord",
        service: axiom.service,
        level: record.level,
        discord_event: record.event,
        message: record.message,
        ...fields,
      });
      return;
    }

    if (record.event.startsWith("discord.") || record.event.startsWith("link.")) {
      axiom.log({
        event: "discord",
        service: axiom.service,
        level: record.level,
        discord_event: record.event,
        message: record.message,
        ...fields,
      });
    }
  };
}
