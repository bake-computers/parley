import type { WireEntry } from "#/types.js";

export async function hashEntries(entries: WireEntry[]): Promise<string> {
  const canonical = JSON.stringify(
    entries.map((entry) => [entry.rank, entry.playerId, entry.score]),
  );
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function shouldBroadcast(previousHash: string, nextHash: string, force: boolean): boolean {
  if (force) {
    return true;
  }
  return previousHash !== nextHash && nextHash.length > 0;
}
