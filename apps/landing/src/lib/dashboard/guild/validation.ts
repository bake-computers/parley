export const TEAM_FORMATS = ["1v1", "2v2", "3v3", "4v4", "5v5"] as const;

export const PLATFORM_OPTIONS = ["pc", "xbox", "psn"] as const;

const TEAM_FORMAT_RE = /^\d+v\d+$/i;
const SNOWFLAKE_RE = /^\d{17,20}$/;

export function normalizeTeamFormat(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function validateTeamFormat(value: string | null | undefined): string | null {
  const normalized = normalizeTeamFormat(value);
  if (!normalized) {
    return "Team format is required";
  }
  if (!TEAM_FORMAT_RE.test(normalized)) {
    return "Use format like 5v5";
  }
  const [a, b] = normalized.split("v").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    return "Use format like 5v5";
  }
  if (a !== b) {
    return "Team sizes must match (e.g. 5v5)";
  }
  return null;
}

export function suggestTeamFormats(query: string | null | undefined): string[] {
  const q = normalizeTeamFormat(query);
  if (!q) {
    return [...TEAM_FORMATS];
  }
  return TEAM_FORMATS.filter((f) => f.startsWith(q));
}

export function validateDiscordSnowflake(value: string | null | undefined, label: string): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }
  if (!SNOWFLAKE_RE.test(trimmed)) {
    return `${label} must be a valid Discord channel ID`;
  }
  return null;
}

export function validateElo(value: number, label: string): string | null {
  if (!Number.isFinite(value) || value < 0) {
    return `${label} must be 0 or greater`;
  }
  if (value > 15_000) {
    return `${label} seems too high`;
  }
  return null;
}

export function validateEloRange(minElo: number, maxElo: number): string | null {
  const minErr = validateElo(minElo, "Min Elo");
  if (minErr) {
    return minErr;
  }
  const maxErr = validateElo(maxElo, "Max Elo");
  if (maxErr) {
    return maxErr;
  }
  if (minElo > 0 && maxElo > 0 && minElo > maxElo) {
    return "Min Elo cannot exceed Max Elo";
  }
  return null;
}

export function validateMaxEloGap(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) {
    return "Max Elo gap must be 0 or greater";
  }
  if (value > 5_000) {
    return "Max Elo gap seems too high";
  }
  return null;
}

export function parsePlatformsInput(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function validatePlatforms(values: string[]): string | null {
  if (values.length === 0) {
    return null;
  }
  const allowed = new Set(PLATFORM_OPTIONS);
  const bad = values.find((v) => !allowed.has(v as (typeof PLATFORM_OPTIONS)[number]));
  if (bad) {
    return `Unknown platform "${bad}". Use pc, xbox, or psn`;
  }
  return null;
}

export function validateDailyMatchLimit(value: number): string | null {
  if (!Number.isInteger(value) || value < 0) {
    return "Daily limit must be a whole number ≥ 0";
  }
  if (value > 10_000) {
    return "Daily limit seems too high";
  }
  return null;
}