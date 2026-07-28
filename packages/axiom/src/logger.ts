import { type AxiomConfig, isAxiomConfigured } from "#/config";
import type { AxiomEvent } from "#/events";

function httpLevel(status: number): "info" | "warn" | "error" {
  if (status >= 500) {
    return "error";
  }
  if (status >= 400) {
    return "warn";
  }
  return "info";
}

export class AxiomLogger {
  private readonly config: AxiomConfig;
  private readonly pending: AxiomEvent[] = [];

  constructor(config: AxiomConfig) {
    this.config = config;
  }

  get service(): string {
    return this.config.service;
  }

  get configured(): boolean {
    return isAxiomConfigured(this.config);
  }

  log(event: AxiomEvent): void {
    if (!this.configured) {
      console.log(JSON.stringify(event));
      return;
    }
    this.pending.push(event);
  }

  logHttp(fields: {
    method: string;
    path: string;
    status: number;
    duration_ms: number;
    user_agent?: string;
    content_type?: string;
    origin?: string;
  }): void {
    this.log({
      event: "http",
      service: this.config.service,
      level: httpLevel(fields.status),
      ...fields,
    });
  }

  logError(code: string, message: string, path?: string): void {
    this.log({
      event: "error",
      service: this.config.service,
      level: "error",
      code,
      message,
      ...(path ? { path } : {}),
    });
  }

  logWs(fields: {
    action: "connect" | "disconnect" | "broadcast" | "rate_limited";
    metric?: string;
    client_ip?: string;
    connection_count?: number;
  }): void {
    const level = fields.action === "rate_limited" ? "warn" : "info";
    this.log({
      event: "ws",
      service: this.config.service,
      level,
      ...fields,
    });
  }

  logDo(fields: {
    action: string;
    metric?: string;
    duration_ms?: number;
    entry_count?: number;
    error?: string;
  }): void {
    this.log({
      event: "do",
      service: this.config.service,
      level: fields.error ? "error" : "info",
      ...fields,
    });
  }

  // Explicit level so Axiom severity is not defaulted to info.
  logAt(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields: Record<string, string | number | boolean | undefined> = {},
  ): void {
    this.log({
      event: "log",
      service: this.config.service,
      level,
      message,
      ...fields,
    });
  }

  logInfo(
    message: string,
    fields: Record<string, string | number | boolean | undefined> = {},
  ): void {
    this.logAt("info", message, fields);
  }

  async flush(): Promise<void> {
    if (!this.configured || this.pending.length === 0) {
      this.pending.length = 0;
      return;
    }

    const events = this.pending.splice(0);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.token}`,
      "Content-Type": "application/json",
    };
    if (this.config.orgId) {
      headers["X-Axiom-Org-Id"] = this.config.orgId;
    }

    const response = await fetch(this.config.ingestUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(events),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "axiom.ingest_failed",
          status: response.status,
          count: events.length,
          ingest_url: this.config.ingestUrl,
          body,
        }),
      );
    }
  }
}
