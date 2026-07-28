import type { Match, MatchParticipant } from "@parley/proto/matchmaking/v1/matchmaking_pb.js";

export type Kda = { kills: number; deaths: number; assists: number };

/**
 * Parse one "K D A" text input. Empty input means the player sat the round
 * out (all zeros). Returns an error message string when the input is not
 * three non-negative integers.
 */
export function parseKDA(input: string): Kda | string {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { kills: 0, deaths: 0, assists: 0 };
  }
  const parts = trimmed.split(/\s+/u);
  if (parts.length !== 3) {
    return "Enter three numbers separated by spaces: kills deaths assists";
  }
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/u.test(part)) {
      return "K/D/A must be whole numbers of zero or more";
    }
    nums.push(Number(part));
  }
  return { kills: nums[0]!, deaths: nums[1]!, assists: nums[2]! };
}

/** Read selected user IDs from a UserSelect interaction payload. */
export function selectValues(interaction: { raw: { data: unknown } }): string[] {
  const data = interaction.raw.data as { values?: string[] };
  return Array.isArray(data.values) ? data.values : [];
}

export function isParticipant(match: Match, discordUserId: string): boolean {
  return (match.participants ?? []).some((p) => p.discordUserId === discordUserId);
}

export function teamParticipants(match: Match, team: string): MatchParticipant[] {
  return (match.participants ?? []).filter((p) => p.team === team);
}

export function formatKDA(p: MatchParticipant): string {
  return `${p.kills ?? 0}/${p.deaths ?? 0}/${p.assists ?? 0}`;
}
