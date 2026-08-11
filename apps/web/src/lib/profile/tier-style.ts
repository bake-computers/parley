import {
  PARLEY_RANK_TIERS,
  parleyRankForElo,
} from "#/lib/profile/parley-rank";

/**
 * Restrained metallic tier colors tuned for the dark glass UI.
 * soft/glow are rgba derivations so they can be used in inline styles.
 */
const TIER_COLORS: Record<string, string> = {
  unspecified: "#8a909a",
  iron: "#9aa1ab",
  bronze: "#c08a5a",
  silver: "#b9c0c9",
  gold: "#d1a75c",
  platinum: "#93c5d4",
  diamond: "#6fc7e8",
  master: "#9f8fd0",
  grandmaster: "#d97b6c",
  challenger: "#e3a94e",
};

const DEFAULT_COLOR = TIER_COLORS.unspecified;

export type TierAccent = {
  color: string;
  soft: string;
  glow: string;
};

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function tierAccent(tierId: string): TierAccent {
  const color = TIER_COLORS[tierId] ?? DEFAULT_COLOR;
  return {
    color,
    soft: hexToRgba(color, 0.14),
    glow: hexToRgba(color, 0.38),
  };
}

export type NextTierProgress = {
  current: string;
  next: string;
  progress01: number;
  pointsToNext: number | null;
};

export function nextTierProgress(elo: number): NextTierProgress {
  const current = parleyRankForElo(elo);
  const index = PARLEY_RANK_TIERS.findIndex((t) => t.id === current.id);
  const next = PARLEY_RANK_TIERS[index + 1] ?? null;

  if (!next) {
    // Top of the ladder: full bar, no target tier.
    return { current: current.label, next: "", progress01: 1, pointsToNext: null };
  }

  const span = next.minElo - current.minElo;
  const progress01 = Math.min(1, Math.max(0, (elo - current.minElo) / span));
  return {
    current: current.label,
    next: next.label,
    progress01,
    pointsToNext: Math.max(0, Math.ceil(next.minElo - elo)),
  };
}
