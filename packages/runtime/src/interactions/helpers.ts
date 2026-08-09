import { isJSONEncodable, type JSONEncodable } from "../builders/types.js";
import type { DiscordRequestContext, JsonObject, JsonValue } from "../types/index.js";

export const INITIAL_RESPONSE_CONTEXT_KEY = "__discord_initial_response__";
export const INITIAL_RESPONSE_RESOLVE_CONTEXT_KEY = "__discord_initial_response_resolve__";

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

/** Drop undefined keys recursively so Discord payloads stay compact. */
export function compactJson(value: unknown): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (isJSONEncodable(value)) {
    return compactJson(value.toJSON());
  }
  if (Array.isArray(value)) {
    return value.map((item) => compactJson(item) ?? null);
  }
  if (typeof value === "object") {
    const out: JsonObject = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const compacted = compactJson(item);
      if (compacted !== undefined) {
        out[key] = compacted;
      }
    }
    return out;
  }
  return undefined;
}

export function normalizePayload(
  input: string | InteractionResponseOptions,
): InteractionResponseOptions {
  return typeof input === "string" ? { content: input } : { ...input };
}

export function prepareResponsePayload(options: InteractionResponseOptions): JsonObject {
  const payload: JsonObject = {};

  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) {
      continue;
    }

    if (key === "embeds" || key === "components") {
      if (!Array.isArray(value)) {
        continue;
      }
      const resolved: JsonValue[] = [];
      for (const item of value) {
        const compacted = compactJson(isJSONEncodable(item) ? item.toJSON() : item);
        if (compacted !== undefined) {
          resolved.push(compacted);
        }
      }
      if (resolved.length > 0) {
        payload[key] = resolved;
      }
      continue;
    }

    const compacted = compactJson(value);
    if (compacted !== undefined) {
      payload[key] = compacted;
    }
  }

  return payload;
}

export function tryCaptureInitialResponse(
  context: DiscordRequestContext,
  response: JsonObject,
): boolean {
  const existing = context.get<JsonObject | undefined>(INITIAL_RESPONSE_CONTEXT_KEY);
  if (existing) {
    return false;
  }

  context.set(INITIAL_RESPONSE_CONTEXT_KEY, response);

  const resolver = context.get<InitialResponseResolver | undefined>(
    INITIAL_RESPONSE_RESOLVE_CONTEXT_KEY,
  );
  if (resolver) {
    context.set(INITIAL_RESPONSE_RESOLVE_CONTEXT_KEY, undefined);
    resolver(response);
  }

  return true;
}
