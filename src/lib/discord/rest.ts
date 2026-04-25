import { err, ok, type Result } from "neverthrow";
import type { DiscordApiError, JsonObject, JsonValue } from "./types";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const REQUEST_TIMEOUT_MS = 5_000;

export interface DiscordRequestOptions {
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  path: string;
  body?: JsonValue;
  token?: string;
  auth?: boolean;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export async function discordRequest<T = JsonValue>(
  options: DiscordRequestOptions,
): Promise<Result<T, DiscordApiError>> {
  const baseUrl = options.apiBaseUrl ?? DISCORD_API_BASE;
  const url = `${baseUrl}${options.path}`;
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  if (options.auth !== false) {
    if (!options.token) {
      return err({
        kind: "discord-api",
        method: options.method,
        path: options.path,
        message: "Discord bot token is missing",
        retryable: false,
      });
    }
    headers.set("Authorization", `Bot ${options.token}`);
  }

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    return err({
      kind: "discord-api" as const,
      method: options.method,
      path: options.path,
      message: "Discord API request failed",
      retryable: true,
      cause,
    });
  }

  if (!response.ok) {
    return err({
      kind: "discord-api",
      method: options.method,
      path: options.path,
      status: response.status,
      message: response.statusText || "Discord API returned an error",
      retryable: isRetryableStatus(response.status),
      body: await readErrorBody(response),
    });
  }

  if (response.status === 204) {
    return ok(undefined as T);
  }

  const text = await response.text();
  if (!text) {
    return ok(undefined as T);
  }

  try {
    return ok(JSON.parse(text) as T);
  } catch (cause) {
    return err({
      kind: "discord-api",
      method: options.method,
      path: options.path,
      status: response.status,
      message: "Discord API returned invalid JSON",
      retryable: false,
      body: text,
      cause,
    });
  }
}

export class DiscordRestClient {
  constructor(
    private readonly token: string | undefined,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiBaseUrl = DISCORD_API_BASE,
  ) {}

  request<T = JsonValue>(
    method: DiscordRequestOptions["method"],
    path: string,
    body?: JsonValue,
    auth = true,
  ): Promise<Result<T, DiscordApiError>> {
    return discordRequest<T>({
      method,
      path,
      body,
      token: this.token,
      auth,
      fetcher: this.fetcher,
      apiBaseUrl: this.apiBaseUrl,
    });
  }

  createInteractionResponse<T = JsonValue>(
    interactionId: string,
    token: string,
    body: JsonObject,
  ): Promise<Result<T, DiscordApiError>> {
    return this.request<T>("POST", `/interactions/${interactionId}/${token}/callback`, body, false);
  }

  editWebhookMessage<T = JsonValue>(
    applicationId: string,
    token: string,
    messageId: string,
    body: JsonObject,
  ): Promise<Result<T, DiscordApiError>> {
    return this.request<T>(
      "PATCH",
      `/webhooks/${applicationId}/${token}/messages/${messageId}`,
      body,
      false,
    );
  }

  createWebhookMessage<T = JsonValue>(
    applicationId: string,
    token: string,
    body: JsonObject,
  ): Promise<Result<T, DiscordApiError>> {
    return this.request<T>("POST", `/webhooks/${applicationId}/${token}`, body, false);
  }

  deleteWebhookMessage(
    applicationId: string,
    token: string,
    messageId: string,
  ): Promise<Result<void, DiscordApiError>> {
    return this.request<void>(
      "DELETE",
      `/webhooks/${applicationId}/${token}/messages/${messageId}`,
      undefined,
      false,
    );
  }
}
