export type TournamentHandoff = {
  guildId: string;
  channelId: string;
  userId: string;
  expiresAt: number;
};

function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    return null;
  }
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

function parsePayload(value: string): TournamentHandoff | null {
  const decoded = fromBase64Url(value);
  if (!decoded) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const payload = parsed as Record<string, unknown>;
    if (
      typeof payload.guildId !== "string" ||
      typeof payload.channelId !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      !Number.isSafeInteger(payload.expiresAt)
    ) {
      return null;
    }
    return {
      guildId: payload.guildId,
      channelId: payload.channelId,
      userId: payload.userId,
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}

/** Verifies the short-lived, Discord-issued context used to create a tournament. */
export async function verifyTournamentHandoff(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<TournamentHandoff | null> {
  const [signature, payload, ...rest] = token.split(".");
  if (!signature || !payload || rest.length > 0) {
    return null;
  }
  const signatureBytes = fromBase64Url(signature);
  const handoff = parsePayload(payload);
  if (!signatureBytes || !handoff || handoff.expiresAt <= now) {
    return null;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(signatureBytes, (char) => char.codePointAt(0) ?? 0),
    new TextEncoder().encode(payload),
  );
  return valid ? handoff : null;
}
