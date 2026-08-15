/**
 * One context-rich JSON event per request hop. Same field names in Go + TS.
 * `message` reads like a sentence; the remaining fields are queryable.
 */
export type WideEvent = {
  ts: string;
  level: "info" | "error";
  event: string;
  message: string;
  service: string;
  where: string;
  request_id: string;
  outcome: "success" | "client_error" | "error";
  duration_ms: number;
  http?: {
    method?: string;
    path?: string;
    status?: number;
    user_agent?: string;
    client_ip?: string;
    bytes_out?: number;
  };
  discord?: {
    surface?: string;
    name?: string;
    detail?: string;
    interaction_id?: string;
    guild_id?: string;
    user_id?: string;
    channel_id?: string;
    interaction_type?: number;
  };
  db?: {
    op?: string;
    table?: string;
    rows?: number;
  };
  matchmaking?: {
    guild_id?: string;
    game?: string;
    team_size?: number;
    win_probability?: number;
    balance_gap?: number;
  };
  error?: {
    type?: string;
    message?: string;
    code?: string;
  };
  env?: {
    hostname?: string;
    colo?: string;
    country?: string;
  };
};

/** Standalone record for logs emitted outside a request (startup, registration). */
export type StandaloneEvent = {
  ts: string;
  level: "info" | "error";
  event: string;
  message: string;
  service: string;
  where?: string;
  request_id?: string;
  error?: { type?: string; message?: string; code?: string };
};
