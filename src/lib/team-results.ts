const RESULT_PATTERN = /^\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*$/;

export interface ParsedPlayerResult {
  kills: number;
  deaths: number;
}

export function parsePlayerResultInput(value: string): ParsedPlayerResult {
  const match = RESULT_PATTERN.exec(value);
  if (!match) {
    throw new Error("Use the format kills/deaths, for example 8/6.");
  }

  const kills = Number(match[1]);
  const deaths = Number(match[2]);
  if (!Number.isInteger(kills) || !Number.isInteger(deaths)) {
    throw new Error("Kills and deaths must be whole numbers.");
  }

  return { kills, deaths };
}

export function mergeTeamResults(
  first: ReadonlyMap<string, ParsedPlayerResult>,
  second: ReadonlyMap<string, ParsedPlayerResult>,
): Map<string, ParsedPlayerResult> {
  const merged = new Map<string, ParsedPlayerResult>();
  for (const [discordUserId, result] of first) {
    merged.set(discordUserId, result);
  }
  for (const [discordUserId, result] of second) {
    merged.set(discordUserId, result);
  }
  return merged;
}
