import { err, ok, type Result } from "neverthrow";
import type { JsonValue } from "~/types/index.js";

const keyCache = new Map<string, Promise<CryptoKey>>();

export type VerifyDiscordRequestError =
  | { kind: "missing-public-key"; message: string }
  | { kind: "missing-signature"; message: string }
  | { kind: "invalid-signature"; message: string }
  | { kind: "invalid-json"; message: string; cause?: unknown };

export interface VerifiedDiscordRequest {
  bodyText: string;
  data: JsonValue;
}

function hexToBytes(value: string): Uint8Array<ArrayBuffer> {
  // If the hex string is malformed or odd-length, return a dummy buffer
  // so crypto.subtle.verify gracefully fails with a 401 instead of crashing.
  if (value.length % 2 !== 0) {
    return new Uint8Array(0);
  }

  const len = value.length / 2;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

function importPublicKey(publicKey: string): Promise<CryptoKey> {
  const cached = keyCache.get(publicKey);
  if (cached) {
    return cached;
  }

  const imported = crypto.subtle
    .importKey("raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"])
    .catch((error: unknown) => {
      keyCache.delete(publicKey);
      throw error;
    });

  keyCache.set(publicKey, imported);
  return imported;
}

/**
 * Verify a Discord interaction request using Ed25519 signature verification.
 *
 * @param {Request} request - The incoming Request object (typically from a Fetch/RequestEvent).
 * @param {string | undefined} publicKey - The Discord application's public key as a hex string.
 *
 * @returns {Promise<Result<VerifiedDiscordRequest, VerifyDiscordRequestError>>} A
 * promise that resolves to a neverthrow Result. On success the Ok value contains
 * an object with the original body text and the parsed JSON data. On failure the
 * Err value is a VerifyDiscordRequestError describing the failure.
 *
 * Possible error kinds:
 * - "missing-public-key": publicKey was not provided
 * - "missing-signature": required signature headers were missing
 * - "invalid-signature": signature verification failed
 * - "invalid-json": body could not be parsed as JSON (cause included)
 *
 * Example:
 *
 * (async () => {
 *   const publicKey = process.env.DISCORD_PUBLIC_KEY; // hex string
 *   const result = await verifyDiscordRequest(request, publicKey);
 *   if (result.isErr()) {
 *     // handle verification error
 *     console.error(result.error);
 *     return new Response('Invalid request', { status: 401 });
 *   }
 *
 *   const { bodyText, data } = result.value;
 *   // `data` is the parsed JSON body (typed as JsonValue)
 *   return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
 * })();
 */
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

  const bodyText = await request.text();
  const encoder = new TextEncoder();
  const timestampBytes = encoder.encode(timestamp);
  const bodyBytes = encoder.encode(bodyText);
  const message = new Uint8Array(new ArrayBuffer(timestampBytes.length + bodyBytes.length));
  message.set(timestampBytes, 0);
  message.set(bodyBytes, timestampBytes.length);

  let key: CryptoKey;
  try {
    key = await importPublicKey(publicKey);
  } catch {
    return err({ kind: "invalid-signature", message: "Discord request signature is invalid" });
  }

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify({ name: "Ed25519" }, key, hexToBytes(signature), message);
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
