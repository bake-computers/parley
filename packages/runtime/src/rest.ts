import { err, ok, type Result } from "neverthrow";
import type {
  APIApplicationCommand,
  RESTGetAPIApplicationEmojisResult,
} from "discord-api-types/v10";
import type { DiscordApiError, JsonObject, JsonValue } from "~/types/index.js";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const REQUEST_TIMEOUT_MS = 5_000;

export interface DiscordRequestOptions {
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  path: string;
  body?: JsonValue | undefined;
  token?: string | undefined;
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

/**
 * Perform a request against the Discord REST API and parse the response.
 *
 * @template T - Expected shape of the parsed JSON response (defaults to JsonValue).
 * @param {DiscordRequestOptions} options - Options for the Discord request.
 * @param {"DELETE" | "GET" | "PATCH" | "POST" | "PUT"} options.method - HTTP method to use.
 * @param {string} options.path - Path component of the Discord API request (e.g. `/channels/:id/messages`).
 * @param {JsonValue | undefined} [options.body] - Optional request body which will be JSON.stringify'd if provided.
 * @param {string | undefined} [options.token] - Bot token to use for Authorization header.
 * @param {boolean | undefined} [options.auth] - Whether to include the Authorization header. Set to `false` for public endpoints like interaction callbacks. Defaults to true.
 * @param {typeof fetch | undefined} [options.fetcher] - Optional fetch implementation to use (useful for tests).
 * @param {string | undefined} [options.apiBaseUrl] - Optional base URL for the API. Defaults to Discord v10 URL.
 * @returns {Promise<Result<T, DiscordApiError>>} A neverthrow Result resolving to the parsed response (ok) or a DiscordApiError (err).
 *
 * The function will:
 * - add Content-Type: application/json
 * - add Authorization: Bot <token> when `auth` is not false and `token` is provided
 * - time out requests after REQUEST_TIMEOUT_MS
 * - return ok(undefined) for 204 No Content or empty bodies
 * - return err(...) on non-2xx responses or on invalid JSON
 *
 * @example
 * // Example: create a channel message
 * import { discordRequest } from "./rest";
 *
 * type Message = { id: string; content: string };
 *
 * const res = await discordRequest<Message>({
 *   method: "POST",
 *   path: "/channels/123/messages",
 *   body: { content: "Hello world" },
 *   token: process.env.BOT_TOKEN,
 * });
 *
 * if (res.isOk()) {
 *   console.log("sent message id", res.value.id);
 * } else {
 *   console.error("discord error", res.error);
 * }
 */
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

  /**
   * Perform a REST request to the Discord API using this client's configuration.
   *
   * @template T - Expected parsed response type (defaults to JsonValue).
   * @param {DiscordRequestOptions['method']} method - HTTP method to use: "DELETE" | "GET" | "PATCH" | "POST" | "PUT".
   * @param {string} path - API path (e.g. `/channels/:id/messages`). This is appended to the client's apiBaseUrl.
   * @param {JsonValue} [body] - Optional request body; will be JSON.stringified when provided.
   * @param {boolean} [auth] - Whether to include the Authorization header. Set to `false` for public endpoints like interaction callbacks.
   * @returns {Promise<Result<T, DiscordApiError>>} A neverthrow Result resolving to the parsed response (ok) or a DiscordApiError (err).
   *
   * @example
   * // Create a channel message using the client
   * import { DiscordRestClient } from "./rest";
   *
   * const client = new DiscordRestClient(process.env.BOT_TOKEN);
   *
   * type Message = { id: string; content: string };
   *
   * // send a message to channel 123456
   * const res = await client.request<Message>(
   *   "POST",
   *   "/channels/123456/messages",
   *   { content: "Hello world" },
   * );
   *
   * if (res.isOk()) {
   *   console.log("sent message id", res.value.id);
   * } else {
   *   console.error("discord error", res.error);
   * }
   */
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

  /**
   * Create a response to an Interaction from the gateway.
   *
   * @template T - Expected parsed response type (defaults to JsonValue).
   * @param {string} interactionId - The ID of the interaction.
   * @param {string} token - The secure token of the interaction.
   * @param {JsonObject} body - The payload for the interaction response.
   * @returns {Promise<Result<T, DiscordApiError>>} A neverthrow Result resolving to the parsed response (ok) or a DiscordApiError (err).
   *
   * @example
   * const client = new DiscordRestClient();
   * await client.createInteractionResponse("interaction-id", "interaction-token", {
   *   type: 4,
   *   data: { content: "Pong!" }
   * });
   */
  createInteractionResponse<T = JsonValue>(
    interactionId: string,
    token: string,
    body: JsonObject,
  ): Promise<Result<T, DiscordApiError>> {
    return this.request<T>("POST", `/interactions/${interactionId}/${token}/callback`, body, false);
  }

  /**
   * Edit a previously sent webhook message (such as an original interaction response).
   *
   * @template T - Expected parsed response type (defaults to JsonValue).
   * @param {string} applicationId - The application ID (or webhook ID).
   * @param {string} token - The webhook token.
   * @param {string} messageId - The ID of the message to edit (or "@original").
   * @param {JsonObject} body - The updated message payload.
   * @returns {Promise<Result<T, DiscordApiError>>} A neverthrow Result resolving to the parsed response (ok) or a DiscordApiError (err).
   *
   * @example
   * const client = new DiscordRestClient();
   * await client.editWebhookMessage("app-id", "webhook-token", "@original", {
   *   content: "Updated response content!"
   * });
   */
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

  /**
   * Execute a webhook to create a message (such as a followup interaction response).
   *
   * @template T - Expected parsed response type (defaults to JsonValue).
   * @param {string} applicationId - The application ID (or webhook ID).
   * @param {string} token - The webhook token.
   * @param {JsonObject} body - The message payload.
   * @returns {Promise<Result<T, DiscordApiError>>} A neverthrow Result resolving to the parsed response (ok) or a DiscordApiError (err).
   *
   * @example
   * const client = new DiscordRestClient();
   * await client.createWebhookMessage("app-id", "webhook-token", {
   *   content: "This is a followup message!"
   * });
   */
  createWebhookMessage<T = JsonValue>(
    applicationId: string,
    token: string,
    body: JsonObject,
  ): Promise<Result<T, DiscordApiError>> {
    return this.request<T>("POST", `/webhooks/${applicationId}/${token}`, body, false);
  }

  /**
   * Create a message in a specific channel. Requires bot token authentication.
   *
   * @template T - Expected parsed response type (defaults to JsonValue).
   * @param {string} channelId - The ID of the target channel.
   * @param {JsonObject} body - The message payload.
   * @returns {Promise<Result<T, DiscordApiError>>} A neverthrow Result resolving to the parsed response (ok) or a DiscordApiError (err).
   *
   * @example
   * const client = new DiscordRestClient(process.env.BOT_TOKEN);
   * await client.createChannelMessage("123456789", {
   *   content: "Hello from the bot!"
   * });
   */
  createChannelMessage<T = JsonValue>(
    channelId: string,
    body: JsonObject,
  ): Promise<Result<T, DiscordApiError>> {
    return this.request<T>("POST", `/channels/${channelId}/messages`, body, true);
  }

  /**
   * Edit a previously sent channel message. Requires bot token authentication.
   *
   * @template T - Expected parsed response type (defaults to JsonValue).
   * @param {string} channelId - The ID of the channel the message is in.
   * @param {string} messageId - The ID of the message to edit.
   * @param {JsonObject} body - The updated message payload.
   * @returns {Promise<Result<T, DiscordApiError>>} A neverthrow Result resolving to the parsed response (ok) or a DiscordApiError (err).
   *
   * @example
   * const client = new DiscordRestClient(process.env.BOT_TOKEN);
   * await client.editChannelMessage("123456789", "987654321", {
   *   content: "Edited message content!"
   * });
   */
  editChannelMessage<T = JsonValue>(
    channelId: string,
    messageId: string,
    body: JsonObject,
  ): Promise<Result<T, DiscordApiError>> {
    return this.request<T>("PATCH", `/channels/${channelId}/messages/${messageId}`, body, true);
  }

  /**
   * List emojis for a specific application. Requires bot token authentication.
   *
   * @param {string} applicationId - The application ID.
   * @returns {Promise<Result<RESTGetAPIApplicationEmojisResult, DiscordApiError>>} A neverthrow Result resolving to the emojis result (ok) or a DiscordApiError (err).
   *
   * @example
   * const client = new DiscordRestClient(process.env.BOT_TOKEN);
   * const result = await client.listApplicationEmojis("app-id");
   * if (result.isOk()) {
   *   console.log("App emojis:", result.value.items);
   * }
   */
  listApplicationEmojis(
    applicationId: string,
  ): Promise<Result<RESTGetAPIApplicationEmojisResult, DiscordApiError>> {
    return this.request<RESTGetAPIApplicationEmojisResult>(
      "GET",
      `/applications/${applicationId}/emojis`,
    );
  }

  /**
   * List global application commands for a specific application. Requires bot token authentication.
   *
   * @param {string} applicationId - The application ID.
   * @returns {Promise<Result<APIApplicationCommand[], DiscordApiError>>} A neverthrow Result resolving to the application commands (ok) or a DiscordApiError (err).
   *
   * @example
   * const client = new DiscordRestClient(process.env.BOT_TOKEN);
   * const result = await client.listApplicationCommands("app-id");
   * if (result.isOk()) {
   *   console.log("Registered commands:", result.value);
   * }
   */
  listApplicationCommands(
    applicationId: string,
  ): Promise<Result<APIApplicationCommand[], DiscordApiError>> {
    return this.request<APIApplicationCommand[]>("GET", `/applications/${applicationId}/commands`);
  }

  /**
   * Delete a previously sent webhook message (such as a followup interaction response).
   *
   * @param {string} applicationId - The application ID (or webhook ID).
   * @param {string} token - The webhook token.
   * @param {string} messageId - The ID of the message to delete (or "@original").
   * @returns {Promise<Result<void, DiscordApiError>>} A neverthrow Result indicating success (ok) or a DiscordApiError (err).
   *
   * @example
   * const client = new DiscordRestClient();
   * await client.deleteWebhookMessage("app-id", "webhook-token", "msg-id");
   */
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
