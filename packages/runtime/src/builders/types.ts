import type { JsonObject, JsonValue } from "~/types/index.js";

export interface JSONEncodable<T extends JsonValue = JsonObject> {
  toJSON(): T;
}

/** Encode a value as JSON, omitting undefined object keys. */
export function encodeValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : encodeValue(item)));
  }

  if (isJSONEncodable(value)) {
    return value.toJSON();
  }

  if (typeof value === "object" && value) {
    const out: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) {
        continue;
      }
      out[key] = encodeValue(item);
    }
    return out;
  }

  return null;
}

export function isJSONEncodable(value: unknown): value is JSONEncodable {
  return (
    typeof value === "object" &&
    value !== null &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  );
}
