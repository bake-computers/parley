export type AxiomEvent =
  | {
      event: "http";
      service: string;
      level: "info" | "warn" | "error";
      method: string;
      path: string;
      status: number;
      duration_ms: number;
      user_agent?: string;
      content_type?: string;
      origin?: string;
    }
  | {
      event: "error";
      service: string;
      level: "error";
      code: string;
      message: string;
      path?: string;
    }
  | {
      event: "ws";
      service: string;
      level: "info" | "warn" | "error";
      action: "connect" | "disconnect" | "broadcast" | "rate_limited";
      metric?: string;
      client_ip?: string;
      connection_count?: number;
    }
  | {
      event: "do";
      service: string;
      level: "info" | "warn" | "error" | "debug";
      action: string;
      metric?: string;
      duration_ms?: number;
      entry_count?: number;
      error?: string;
    }
  | {
      event: "log";
      service: string;
      level: "debug" | "info" | "warn" | "error";
      message: string;
      discord_event?: string;
      [key: string]: string | number | boolean | undefined;
    }
  | {
      event: "discord";
      service: string;
      level: string;
      discord_event: string;
      message: string;
      [key: string]: string | number | boolean | undefined;
    };
