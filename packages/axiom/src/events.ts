export type AxiomEvent =
  | {
      event: "http";
      service: string;
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
      code: string;
      message: string;
      path?: string;
    }
  | {
      event: "ws";
      service: string;
      action: "connect" | "disconnect" | "broadcast" | "rate_limited";
      metric?: string;
      client_ip?: string;
      connection_count?: number;
    }
  | {
      event: "do";
      service: string;
      action: string;
      metric?: string;
      duration_ms?: number;
      entry_count?: number;
      error?: string;
    }
  | {
      event: "info";
      service: string;
      message: string;
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
