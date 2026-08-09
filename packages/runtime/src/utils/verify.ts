import { err, ok, type Result } from "../result.js";
import type { JsonValue } from "~/types/index.js";

const keyCache = new Map<string, Promise<CryptoKey>>();
const textEncoder = new TextEncoder();

const HEX_LOOKUP = /* @__PURE__ */ (() => {
  const table = new Int16Array(128);
  table.fill(-1);
  for (let i = 0; i <= 9; i++) {
    table[48 + i] = i; // 0-9
  }
  for (let i = 0; i < 6; i++) {
    table[65 + i] = 10 + i; // A-F
    table[97 + i] = 10 + i; // a-f
  }
  return table;
})();

export type VerifyDiscordRequestError =
  | { kind: "missing-public-key"; message: string }
  | { kind: "missing-signature"; message: string }
  | { kind: "invalid-signature"; message: string }
  | { kind: "invalid-json"; message: string; cause?: unknown };

export interface VerifiedDiscordRequest {
  bodyText: string;
  data: JsonValue;
}

function hexToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  const length = value.length;
  if (length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(length / 2);
  for (let i = 0, j = 0; i < length; i += 2, j++) {
    const hi = value.charCodeAt(i);
    const lo = value.charCodeAt(i + 1);
    if (hi >= 128 || lo >= 128) {
      return null;
    }
    const high = HEX_LOOKUP[hi]!;
    const low = HEX_LOOKUP[lo]!;
    if (high < 0 || low < 0) {
      return null;
    }
    bytes[j] = (high << 4) | low;
  }
  return bytes;
}

function importPublicKey(publicKey: string): Promise<CryptoKey> {
  const cached = keyCache.get(publicKey);
  if (cached) {
    return cached;
  }

  const keyBytes = hexToBytes(publicKey);
  if (!keyBytes) {
    const failed = Promise.reject(new Error("invalid public key"));
    // Prevent unhandled rejection if caller doesn't await immediately.
    failed.catch(() => undefined);
    return failed;
  }

  const imported = crypto.subtle
    .importKey("raw", keyBytes, { name: "Ed25519" }, false, ["verify"])
    .catch((error: unknown) => {
      keyCache.delete(publicKey);
      throw error;
    });

  keyCache.set(publicKey, imported);
  return imported;
}

/** Verify a Discord interaction request via Ed25519 (`crypto.subtle.verify`). */
export async function verifyDiscordRequest(
  request: Request,
  publicKey: string | undefined,
): Promise<Result<VerifiedDiscordRequest, VerifyDiscordRequestError>> {
  if (!publicKey) {
    return err({ kind: "missing-public-key", message: "Discord public key is missing" });
  }

  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) {
    return err({ kind: "missing-signature", message: "Discord signature headers are missing" });
  }

  // Kick off key import (usually cache-hit) while the body streams in.
  const keyPromise = importPublicKey(publicKey);
  const signatureBytes = hexToBytes(signature);
  if (!signatureBytes) {
    return err({ kind: "invalid-signature", message: "Discord request signature is invalid" });
  }

  const bodyText = await request.text();
  // timestamp is ASCII digits; concat-then-encode matches byte-concat of UTF-8 parts.
  const message = textEncoder.encode(timestamp + bodyText);

  let key: CryptoKey;
  try {
    key = await keyPromise;
  } catch {
    return err({ kind: "invalid-signature", message: "Discord request signature is invalid" });
  }

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify({ name: "Ed25519" }, key, signatureBytes, message);
  } catch {
    return err({ kind: "invalid-signature", message: "Discord request signature is invalid" });
  }

  if (!valid) {
    return err({ kind: "invalid-signature", message: "Discord request signature is invalid" });
  }

  try {
    return ok({ bodyText, data: JSON.parse(bodyText) as JsonValue });
  } catch (cause) {
    return err({ kind: "invalid-json", message: "Discord request body is not valid JSON", cause });
  }
}
