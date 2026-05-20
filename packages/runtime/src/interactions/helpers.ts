import { err, type Result } from "neverthrow";
import { isJSONEncodable, type JSONEncodable } from "../builders/index.js";
import type {
  DiscordApiError,
  DiscordRequestContext,
  JsonObject,
  JsonValue,
} from "../types/index.js";
import {
  INITIAL_RESPONSE_CONTEXT_KEY,
  INITIAL_RESPONSE_RESOLVE_CONTEXT_KEY,
} from "./constants.js";

type InitialResponseResolver = (response: JsonObject | null) => void;

export interface InteractionResponseOptions {
  content?: string;
  tts?: boolean;
  embeds?: (JsonObject | JSONEncodable<JsonObject>)[];
  components?: (JsonObject | JSONEncodable<JsonObject>)[];
  allowed_mentions?: JsonObject;
  flags?: number;
  poll?: JsonObject;
  attachments?: JsonObject[];
  [key: string]: unknown;
}

function isJsonValue(value: unknown): value is JsonValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value) ||
    (typeof value === "object" && value !== null)
  );
}

function normalizePayload(input: string | InteractionResponseOptions): InteractionResponseOptions {
  return typeof input === "string" ? { content: input } : { ...input };
}

function resolveArray(value: unknown): JsonValue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item: unknown) => (isJSONEncodable(item) ? item.toJSON() : (item as JsonValue)));
}

function prepareResponsePayload(options: InteractionResponseOptions): JsonObject {
  const payload: JsonObject = {};

  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) {
      continue;
    }
    if (key === "embeds" || key === "components") {
      const resolved = resolveArray(value);
      if (resolved && resolved.length > 0) {
        payload[key] = resolved;
      }
      continue;
    }
    if (isJsonValue(value)) {
      payload[key] = value;
    }
  }

  return payload;
}

function interactionErrorResult(
  method: string,
  path: string,
  message: string,
): Result<never, DiscordApiError> {
  return err({
    kind: "discord-api",
    method,
    path,
    message,
    retryable: false,
  });
}

function resolveInitialResponse(context: DiscordRequestContext, response: JsonObject | null): void {
  const resolver = context.get<InitialResponseResolver | undefined>(
    INITIAL_RESPONSE_RESOLVE_CONTEXT_KEY,
  );
  if (!resolver) {
    return;
  }

  context.set(INITIAL_RESPONSE_RESOLVE_CONTEXT_KEY, undefined);
  resolver(response);
}

function tryCaptureInitialResponse(context: DiscordRequestContext, response: JsonObject): boolean {
  const existing = context.get<JsonObject | undefined>(INITIAL_RESPONSE_CONTEXT_KEY);
  if (existing) {
    return false;
  }

  context.set(INITIAL_RESPONSE_CONTEXT_KEY, response);
  resolveInitialResponse(context, response);
  return true;
}

export {
  isJsonValue,
  normalizePayload,
  resolveArray,
  prepareResponsePayload,
  interactionErrorResult,
  resolveInitialResponse,
  tryCaptureInitialResponse,
};
