import { err, ok, type Result, fromPromise } from "neverthrow";
import type { JsonValue } from "~/types/index.js";

const keyCache = new Map<string, CryptoKey>();

export type VerifyDiscordRequestError =
  | { kind: "missing-public-key"; message: string }
  | { kind: "missing-signature"; message: string }
  | { kind: "invalid-signature"; message: string }
  | { kind: "invalid-json"; message: string; cause?: unknown };

export interface VerifiedDiscordRequest {
  bodyText: string;
  data: JsonValue;
}

function hexToBytes(value: string): Uint8Array {
  const matches = value.match(/.{1,2}/gu);
  if (!matches) {
    throw new Error("Invalid hex string");
  }
  return new Uint8Array(matches.map((byte) => Number.parseInt(byte, 16)));
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value);
  return copy.buffer as ArrayBuffer;
}

async function importPublicKey(publicKey: string): Promise<CryptoKey> {
  const cached = keyCache.get(publicKey);
  if (cached) {
    return cached;
  }

  const imported = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(hexToBytes(publicKey)),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  keyCache.set(publicKey, imported);
  return imported;
}

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

  const bodyText = await request.clone().text();
  const encoder = new TextEncoder();
  const timestampBytes = encoder.encode(timestamp);
  const bodyBytes = encoder.encode(bodyText);
  const message = new Uint8Array(timestampBytes.length + bodyBytes.length);
  message.set(timestampBytes, 0);
  message.set(bodyBytes, timestampBytes.length);

  const keyResult = await fromPromise(
    importPublicKey(publicKey),
    () =>
      ({
        kind: "invalid-signature",
        message: "Discord request signature is invalid",
      }) as VerifyDiscordRequestError,
  );

  if (keyResult.isErr()) {
    return err(keyResult.error);
  }

  const key = keyResult.value;
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    toArrayBuffer(hexToBytes(signature)),
    toArrayBuffer(message),
  );

  if (!valid) {
    return err({ kind: "invalid-signature", message: "Discord request signature is invalid" });
  }

  try {
    return ok({ bodyText, data: JSON.parse(bodyText) as JsonValue });
  } catch (cause) {
    return err({ kind: "invalid-json", message: "Discord request body is not valid JSON", cause });
  }
}
