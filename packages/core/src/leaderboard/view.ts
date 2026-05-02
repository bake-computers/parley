import type { CachedGuildRosterMember } from "../guild/rosterCache";

export const LEADERBOARD_PAGINATION_PREFIX = "leaderboard-page";
export const LEADERBOARD_PAGE_SIZE = 10;
export const LEADERBOARD_MIN_MATCHES_DEFAULT = 1;

export type LeaderboardScope = "server" | "global";
export type LeaderboardPlatformFilter = "all" | "pc" | "xbox" | "playstation";

export interface LeaderboardPaginationCustomId {
  viewId: string;
  page: number;
}

export interface LeaderboardEntry {
  playerId: number;
  username: string;
  platform: string;
  internalElo: number;
  internalMatches: number;
  internalWins: number;
  internalLosses: number;
  discordUserId: string | null;
}

export function normalizeLeaderboardScope(value: string | null | undefined): LeaderboardScope {
  return value === "global" ? "global" : "server";
}

export function normalizeLeaderboardPlatform(
  value: string | null | undefined,
): LeaderboardPlatformFilter {
  if (value === "pc" || value === "xbox" || value === "playstation") {
    return value;
  }
  return "all";
}

export function normalizeLeaderboardMinMatches(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return LEADERBOARD_MIN_MATCHES_DEFAULT;
  }

  return Math.max(0, Math.min(500, Math.trunc(value)));
}

export function leaderboardPageCount(total: number, pageSize = LEADERBOARD_PAGE_SIZE): number {
  const safeTotal = Math.max(0, Math.trunc(total));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const pageCount = Math.ceil(safeTotal / safePageSize);
  return Math.max(1, pageCount);
}

export function clampLeaderboardPage(
  page: number,
  total: number,
  pageSize = LEADERBOARD_PAGE_SIZE,
): number {
  if (!Number.isFinite(page)) {
    return 0;
  }

  const maxPage = leaderboardPageCount(total, pageSize) - 1;
  return Math.max(0, Math.min(maxPage, Math.trunc(page)));
}

export function leaderboardPageOffset(
  page: number,
  total: number,
  pageSize = LEADERBOARD_PAGE_SIZE,
): number {
  return clampLeaderboardPage(page, total, pageSize) * Math.max(1, Math.trunc(pageSize));
}

export function compareLeaderboardEntries(
  left: Pick<LeaderboardEntry, "internalElo" | "internalMatches" | "username" | "playerId">,
  right: Pick<LeaderboardEntry, "internalElo" | "internalMatches" | "username" | "playerId">,
): number {
  if (right.internalElo !== left.internalElo) {
    return right.internalElo - left.internalElo;
  }

  if (right.internalMatches !== left.internalMatches) {
    return right.internalMatches - left.internalMatches;
  }

  const usernameComparison = left.username.localeCompare(right.username);
  if (usernameComparison !== 0) {
    return usernameComparison;
  }

  return left.playerId - right.playerId;
}

export function toLeaderboardEntryFromRosterMember(
  member: CachedGuildRosterMember,
): LeaderboardEntry {
  return {
    playerId: member.playerId,
    username: member.username,
    platform: member.platform,
    internalElo: member.internalElo,
    internalMatches: member.internalMatches,
    internalWins: member.internalWins,
    internalLosses: member.internalLosses,
    discordUserId: member.discordUserId,
  };
}

export function filterLeaderboardEntries(
  entries: readonly LeaderboardEntry[],
  input: {
    platform: LeaderboardPlatformFilter;
    minMatches: number;
  },
): LeaderboardEntry[] {
  return entries.filter((entry) => {
    if (entry.internalMatches < input.minMatches) {
      return false;
    }

    if (input.platform !== "all" && entry.platform !== input.platform) {
      return false;
    }

    return true;
  });
}

export function buildLeaderboardPaginationCustomId(viewId: string, page: number): string {
  const safePage = Math.max(0, Math.trunc(page));
  const params = new URLSearchParams({ page: String(safePage) });
  return `${LEADERBOARD_PAGINATION_PREFIX}/${encodeURIComponent(viewId)}?${params.toString()}`;
}

export function parseLeaderboardPaginationCustomId(
  customId: string,
): LeaderboardPaginationCustomId | null {
  const [pathRaw = "", queryRaw = ""] = customId.split("?");
  const path = pathRaw.split("/").filter(Boolean);
  if (path.length !== 2 || path[0] !== LEADERBOARD_PAGINATION_PREFIX) {
    return null;
  }

  const page = Number(new URLSearchParams(queryRaw).get("page"));
  if (!Number.isFinite(page)) {
    return null;
  }

  try {
    const encodedViewId = path[1];
    if (!encodedViewId) {
      return null;
    }

    const viewId = decodeURIComponent(encodedViewId);
    if (!viewId) {
      return null;
    }

    return {
      viewId,
      page: Math.max(0, Math.trunc(page)),
    };
  } catch {
    return null;
  }
}

export function formatLeaderboardRow(rank: number, entry: LeaderboardEntry): string {
  const display = entry.discordUserId ? `<@${entry.discordUserId}>` : entry.username;
  const elo = Math.round(entry.internalElo);
  return `#${rank} ${display} — ELO ${elo} • ${entry.internalWins}-${entry.internalLosses} (${entry.internalMatches})`;
}

export function formatLeaderboardPlatformLabel(platform: LeaderboardPlatformFilter): string {
  if (platform === "all") {
    return "All";
  }

  if (platform === "pc") {
    return "PC";
  }

  if (platform === "xbox") {
    return "Xbox";
  }

  return "PlayStation";
}
