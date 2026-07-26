import { describe, expect, test } from "vitest";
import { verifyTournamentHandoff } from "./handoff.js";

function base64Url(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function signedHandoff(payload: object, secret = "test-secret"): Promise<string> {
  const body = base64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCodePoint(byte);
  return `${base64Url(binary)}.${body}`;
}

describe("verifyTournamentHandoff", () => {
  test("accepts a current signature and payload", async () => {
    const token = await signedHandoff({
      guildId: "guild-1",
      channelId: "channel-1",
      userId: "user-1",
      expiresAt: 2_000,
    });
    await expect(verifyTournamentHandoff(token, "test-secret", 1_000)).resolves.toEqual({
      guildId: "guild-1",
      channelId: "channel-1",
      userId: "user-1",
      expiresAt: 2_000,
    });
  });

  test("rejects expired and tampered handoffs", async () => {
    const token = await signedHandoff({
      guildId: "guild-1",
      channelId: "channel-1",
      userId: "user-1",
      expiresAt: 2_000,
    });
    await expect(verifyTournamentHandoff(token, "test-secret", 2_000)).resolves.toBeNull();
    await expect(verifyTournamentHandoff(`${token}x`, "test-secret", 1_000)).resolves.toBeNull();
  });
});
