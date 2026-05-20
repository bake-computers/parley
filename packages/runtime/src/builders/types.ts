import type { JsonObject, JsonValue } from "~/types/index.js";

export interface JSONEncodable<T extends JsonValue = JsonObject> {
  toJSON(): T;
}

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
    return value.map((item) => encodeValue(item));
  }

  if (isJSONEncodable(value)) {
    return value.toJSON();
  }

  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encodeValue(item)]),
    ) as JsonObject;
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

export function resolveJson<T extends JsonValue>(value: T | JSONEncodable<T>): T {
  return isJSONEncodable(value) ? (value.toJSON() as T) : (value as T);
}
