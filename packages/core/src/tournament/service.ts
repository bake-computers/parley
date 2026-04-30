import type { KVNamespace } from "@cloudflare/workers-types";
import type { DbClient } from "@parley/db/client";
import type {
  TournamentAutocompleteRecord,
  TournamentBracketMatchRecord,
  TournamentBracketMatchStatus,
  TournamentBracketSlot,
  TournamentEntryWithPlayers,
  TournamentFormat,
  TournamentRecord,
  TournamentStatus,
  TournamentWithEntries,
} from "@parley/db/tournaments";
import {
  createTournamentBracketMatches,
  getTournamentBracketMatch,
  getTournamentWithEntries,
  listPublicTournamentAutocomplete,
  listOverdueTournamentsDueToAutoStart,
  listPublicTournaments,
  listTournamentBracketMatches,
  updateTournament,
  updateTournamentBracketMatch,
  updateTournamentBracketMatchSlot,
  updateTournamentEntry,
  updateTournamentEntrySeeds,
} from "@parley/db/tournaments";
import type { TeamCandidate } from "../team/balance";
import { buildMatchmakingQueueSnapshot } from "../team/matchmaking";
import { buildTournamentBracket } from "./bracket";
import { seedTournamentEntries } from "./seeding";

const TOURNAMENT_CACHE_TTL_SECONDS = 60;

export interface TournamentJoinValidationResult {
  ok: boolean;
  message: string | null;
}

export interface TournamentStatusSnapshot {
  tournament: TournamentWithEntries;
  entries: TournamentEntryWithPlayers[];
  bracketMatches: TournamentBracketMatchRecord[];
}

export interface TournamentStartResult {
  started: boolean;
  readyBracketMatches: TournamentBracketMatchRecord[];
  snapshot: TournamentStatusSnapshot;
}

export interface TournamentAdvanceResult {
  completedTournament: boolean;
  readyBracketMatches: TournamentBracketMatchRecord[];
  snapshot: TournamentStatusSnapshot;
}

export interface TournamentAutocompleteChoice {
  id: number;
  name: string;
  status: TournamentStatus;
  teamCap: number;
  entryCount: number;
}

export function normalizeTournamentText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatTournamentStatusText(status: TournamentStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Completed";
    case "full_pending_start":
      return "Full";
    case "open":
    default:
      return "Open";
  }
}

export function filterTournamentAutocompleteChoices(
  tournaments: readonly (
    | TournamentRecord
    | TournamentAutocompleteChoice
    | TournamentAutocompleteRecord
  )[],
  input: {
    query?: string | null;
    statuses?: readonly TournamentStatus[];
    entryCounts?: ReadonlyMap<number, number>;
    limit?: number;
  } = {},
): TournamentAutocompleteChoice[] {
  const normalizedQuery = normalizeTournamentText(input.query ?? "");
  const statuses = input.statuses ? new Set(input.statuses) : null;
  const limit = Math.max(1, Math.min(25, Math.trunc(input.limit ?? 25)));

  return tournaments
    .filter((tournament) => {
      if (statuses && !statuses.has(tournament.status as TournamentStatus)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        String(tournament.id).startsWith(normalizedQuery) ||
        normalizeTournamentText(tournament.name).includes(normalizedQuery)
      );
    })
    .slice(0, limit)
    .map((tournament) => ({
      id: tournament.id,
      name: tournament.name,
      status: tournament.status as TournamentStatus,
      teamCap: tournament.teamCap,
      entryCount:
        "entryCount" in tournament && typeof tournament.entryCount === "number"
          ? tournament.entryCount
          : (input.entryCounts?.get(tournament.id) ?? 0),
    }));
}

export function formatTournamentAutocompleteLabel(choice: TournamentAutocompleteChoice): string {
  return `#${choice.id} • ${choice.name} • ${formatTournamentStatusText(choice.status)} • ${choice.entryCount}/${choice.teamCap}`;
}

export function buildTournamentListCacheKey(): string {
  return "tournament:list:v1:public";
}

export function buildTournamentSummaryCacheKey(tournamentId: number): string {
  return `tournament:summary:v1:${tournamentId}`;
}

export function buildTournamentBracketCacheKey(tournamentId: number): string {
  return `tournament:bracket:v1:${tournamentId}`;
}

export function buildTournamentEntrySnapshot(players: readonly TeamCandidate[]) {
  return buildMatchmakingQueueSnapshot(players);
}

export function validateTournamentJoin(input: {
  tournament: Pick<TournamentRecord, "status" | "teamCap">;
  existingEntries: readonly TournamentEntryWithPlayers[];
  teamName: string;
  captainDiscordUserId: string;
  players: readonly TeamCandidate[];
}): TournamentJoinValidationResult {
  if (input.tournament.status !== "open") {
    return {
      ok: false,
      message: "This tournament is not accepting new teams.",
    };
  }

  if (input.existingEntries.length >= input.tournament.teamCap) {
    return {
      ok: false,
      message: "This tournament is already full.",
    };
  }

  if (input.players.length !== 5) {
    return {
      ok: false,
      message: "Tournament entries require exactly 5 ready registered players.",
    };
  }

  if (!input.players.some((player) => player.discordUserId === input.captainDiscordUserId)) {
    return {
      ok: false,
      message: "The team captain must be one of the selected players.",
    };
  }

  const teamNameNormalized = normalizeTournamentText(input.teamName);
  if (teamNameNormalized.length < 2) {
    return {
      ok: false,
      message: "Tournament team names must be at least 2 characters long.",
    };
  }

  if (input.existingEntries.some((entry) => entry.teamNameNormalized === teamNameNormalized)) {
    return {
      ok: false,
      message: "That team name is already taken in this tournament.",
    };
  }

  const existingDiscordUserIds = new Set(
    input.existingEntries.flatMap((entry) => entry.players.map((player) => player.discordUserId)),
  );
  const existingPlayerIds = new Set(
    input.existingEntries.flatMap((entry) => entry.players.map((player) => player.playerId)),
  );

  for (const player of input.players) {
    if (
      existingDiscordUserIds.has(player.discordUserId) ||
      existingPlayerIds.has(player.playerId)
    ) {
      return {
        ok: false,
        message: "One or more selected players are already registered on another tournament team.",
      };
    }
  }

  return {
    ok: true,
    message: null,
  };
}

async function readJsonCache<T>(
  cache: KVNamespace | null | undefined,
  key: string,
): Promise<T | null> {
  if (!cache) {
    return null;
  }

  try {
    const raw = await cache.get(key, "text");
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonCache<T>(
  cache: KVNamespace | null | undefined,
  key: string,
  value: T,
): Promise<void> {
  if (!cache) {
    return;
  }

  await cache.put(key, JSON.stringify(value), {
    expirationTtl: TOURNAMENT_CACHE_TTL_SECONDS,
  });
}

export async function readPublicTournamentListCache(
  cache: KVNamespace | null | undefined,
): Promise<TournamentRecord[] | null> {
  return readJsonCache(cache, buildTournamentListCacheKey());
}

export async function writePublicTournamentListCache(
  cache: KVNamespace | null | undefined,
  tournaments: readonly TournamentRecord[],
): Promise<void> {
  await writeJsonCache(cache, buildTournamentListCacheKey(), tournaments);
}

export async function readTournamentSummaryCache(
  cache: KVNamespace | null | undefined,
  tournamentId: number,
): Promise<TournamentWithEntries | null> {
  return readJsonCache(cache, buildTournamentSummaryCacheKey(tournamentId));
}

export async function writeTournamentSummaryCache(
  cache: KVNamespace | null | undefined,
  snapshot: TournamentWithEntries,
): Promise<void> {
  await writeJsonCache(cache, buildTournamentSummaryCacheKey(snapshot.id), snapshot);
}

export async function readTournamentBracketCache(
  cache: KVNamespace | null | undefined,
  tournamentId: number,
): Promise<TournamentBracketMatchRecord[] | null> {
  return readJsonCache(cache, buildTournamentBracketCacheKey(tournamentId));
}

export async function writeTournamentBracketCache(
  cache: KVNamespace | null | undefined,
  tournamentId: number,
  matches: readonly TournamentBracketMatchRecord[],
): Promise<void> {
  await writeJsonCache(cache, buildTournamentBracketCacheKey(tournamentId), matches);
}

export async function invalidateTournamentCaches(
  cache: KVNamespace | null | undefined,
  tournamentId?: number | null,
): Promise<void> {
  if (!cache) {
    return;
  }

  await cache.delete(buildTournamentListCacheKey());
  if (typeof tournamentId === "number") {
    await cache.delete(buildTournamentSummaryCacheKey(tournamentId));
    await cache.delete(buildTournamentBracketCacheKey(tournamentId));
  }
}

export async function getTournamentStatusSnapshot(
  database: DbClient | null | undefined,
  tournamentId: number,
): Promise<TournamentStatusSnapshot | null> {
  if (!database) {
    return null;
  }

  const tournamentWithEntries = await getTournamentWithEntries(database, tournamentId);
  if (!tournamentWithEntries) {
    return null;
  }

  const bracketMatches = await listTournamentBracketMatches(database, tournamentId);
  return {
    tournament: tournamentWithEntries,
    entries: tournamentWithEntries.entries,
    bracketMatches,
  };
}

export async function refreshTournamentCapacityStatus(
  database: DbClient,
  tournament: Pick<TournamentRecord, "id" | "status" | "teamCap">,
  entryCount: number,
  nowMs = Date.now(),
): Promise<TournamentStatus> {
  if (entryCount >= tournament.teamCap && tournament.status === "open") {
    await updateTournament(database, {
      tournamentId: tournament.id,
      status: "full_pending_start",
      filledAt: nowMs,
      autoStartAt: nowMs + 15 * 60 * 1000,
    });
    return "full_pending_start";
  }

  if (entryCount < tournament.teamCap && tournament.status === "full_pending_start") {
    await updateTournament(database, {
      tournamentId: tournament.id,
      status: "open",
      filledAt: null,
      autoStartAt: null,
    });
    return "open";
  }

  return tournament.status as TournamentStatus;
}

export async function listBrowsableTournaments(
  cache: KVNamespace | null | undefined,
  database: DbClient | null | undefined,
  input?: {
    query?: string | null;
    format?: TournamentFormat | null;
    statuses?: TournamentStatus[];
  },
): Promise<TournamentRecord[]> {
  const canUseBroadCache =
    !input?.query && !input?.format && (!input?.statuses || input.statuses.length === 0);

  if (canUseBroadCache) {
    const cached = await readPublicTournamentListCache(cache);
    if (cached) {
      return cached;
    }
  }

  const normalizedQuery = input?.query ? normalizeTournamentText(input.query) : null;
  const tournaments = await listPublicTournaments(database, {
    query: normalizedQuery,
    format: input?.format ?? null,
    statuses: input?.statuses,
  });

  if (canUseBroadCache) {
    await writePublicTournamentListCache(cache, tournaments);
  }

  return tournaments;
}

export async function listTournamentAutocompleteChoices(
  cache: KVNamespace | null | undefined,
  database: DbClient | null | undefined,
  input?: {
    query?: string | null;
    statuses?: TournamentStatus[];
    limit?: number;
  },
): Promise<TournamentAutocompleteChoice[]> {
  const limit = Math.max(1, Math.min(25, Math.trunc(input?.limit ?? 25)));
  const cached = await readPublicTournamentListCache(cache);
  if (cached) {
    const entryCounts = new Map<number, number>();
    for (const tournament of cached) {
      entryCounts.set(tournament.id, 0);
    }
    return filterTournamentAutocompleteChoices(cached, {
      query: input?.query,
      statuses: input?.statuses,
      entryCounts,
      limit,
    });
  }

  const normalizedQuery = input?.query ? normalizeTournamentText(input.query) : null;
  const tournaments = await listPublicTournamentAutocomplete(database, {
    query: normalizedQuery,
    statuses: input?.statuses,
    limit,
  });

  return filterTournamentAutocompleteChoices(tournaments, {
    query: input?.query,
    statuses: input?.statuses,
    limit,
  });
}

function nextMatchStatus(
  match: Pick<TournamentBracketMatchRecord, "entryAId" | "entryBId" | "customMatchId">,
): TournamentBracketMatchStatus {
  if (match.entryAId !== null && match.entryBId !== null && match.customMatchId === null) {
    return "ready";
  }

  if (match.customMatchId !== null) {
    return "pending_results";
  }

  return "waiting";
}

async function assignEntryToTargetMatch(
  database: DbClient,
  input: {
    bracketMatchId: number;
    slot: TournamentBracketSlot;
    entryId: number;
  },
): Promise<void> {
  const current = await getTournamentBracketMatch(database, input.bracketMatchId);
  if (!current) {
    throw new Error("Tournament target match not found");
  }

  const next = {
    entryAId: input.slot === "A" ? input.entryId : current.entryAId,
    entryBId: input.slot === "B" ? input.entryId : current.entryBId,
    customMatchId: current.customMatchId,
  };

  await updateTournamentBracketMatchSlot(database, {
    bracketMatchId: input.bracketMatchId,
    slot: input.slot,
    entryId: input.entryId,
    status: nextMatchStatus(next),
  });
}

function buildSeedNumberToEntryIdMap(
  entries: ReadonlyArray<{ id: number; seedNumber: number | null }>,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const entry of entries) {
    if (typeof entry.seedNumber === "number") {
      map.set(entry.seedNumber, entry.id);
    }
  }
  return map;
}

export async function startTournament(
  database: DbClient,
  tournamentId: number,
  nowMs = Date.now(),
): Promise<TournamentStartResult> {
  const snapshot = await getTournamentStatusSnapshot(database, tournamentId);
  if (!snapshot) {
    throw new Error("Tournament not found");
  }

  if (snapshot.tournament.status === "active") {
    return {
      started: false,
      readyBracketMatches: snapshot.bracketMatches.filter(
        (match) => match.status === "ready" && match.customMatchId === null,
      ),
      snapshot,
    };
  }

  if (snapshot.tournament.status !== "full_pending_start") {
    throw new Error("Tournament is not ready to start");
  }

  if (snapshot.entries.length !== snapshot.tournament.teamCap) {
    throw new Error("Tournament cannot start until the bracket is full");
  }

  if (snapshot.bracketMatches.length > 0) {
    await updateTournament(database, {
      tournamentId,
      status: "active",
      startedAt: snapshot.tournament.startedAt ?? nowMs,
      autoStartAt: null,
    });
    const activeSnapshot = await getTournamentStatusSnapshot(database, tournamentId);
    if (!activeSnapshot) {
      throw new Error("Tournament failed to reload after start");
    }
    return {
      started: false,
      readyBracketMatches: activeSnapshot.bracketMatches.filter(
        (match) => match.status === "ready" && match.customMatchId === null,
      ),
      snapshot: activeSnapshot,
    };
  }

  const seededEntries = seedTournamentEntries(snapshot.entries);
  await updateTournamentEntrySeeds(
    database,
    seededEntries.map((entry) => ({
      entryId: entry.id,
      seedNumber: entry.seedNumber,
      status: "active",
    })),
  );

  const bracketTemplate = buildTournamentBracket(
    snapshot.tournament.format as TournamentFormat,
    snapshot.tournament.teamCap,
  );
  const seedNumberToEntryId = buildSeedNumberToEntryIdMap(seededEntries);

  const insertedIds = await createTournamentBracketMatches(
    database,
    bracketTemplate.map((node) => ({
      tournamentId,
      bracket: node.bracket,
      roundNumber: node.roundNumber,
      matchNumber: node.matchNumber,
      status:
        node.entryASeedNumber !== null && node.entryBSeedNumber !== null ? "ready" : node.status,
      entryAId:
        node.entryASeedNumber !== null
          ? (seedNumberToEntryId.get(node.entryASeedNumber) ?? null)
          : null,
      entryBId:
        node.entryBSeedNumber !== null
          ? (seedNumberToEntryId.get(node.entryBSeedNumber) ?? null)
          : null,
    })),
  );

  const keyToId = new Map<string, number>();
  for (const [index, node] of bracketTemplate.entries()) {
    const id = insertedIds[index];
    if (typeof id === "number") {
      keyToId.set(node.key, id);
    }
  }

  for (const [index, node] of bracketTemplate.entries()) {
    const bracketMatchId = insertedIds[index];
    if (typeof bracketMatchId !== "number") {
      continue;
    }

    await updateTournamentBracketMatch(database, {
      bracketMatchId,
      winnerToMatchId: node.winnerToKey ? (keyToId.get(node.winnerToKey) ?? null) : null,
      winnerToSlot: node.winnerToSlot,
      loserToMatchId: node.loserToKey ? (keyToId.get(node.loserToKey) ?? null) : null,
      loserToSlot: node.loserToSlot,
    });
  }

  await updateTournament(database, {
    tournamentId,
    status: "active",
    startedAt: nowMs,
    autoStartAt: null,
  });

  const activeSnapshot = await getTournamentStatusSnapshot(database, tournamentId);
  if (!activeSnapshot) {
    throw new Error("Tournament failed to reload after start");
  }

  return {
    started: true,
    readyBracketMatches: activeSnapshot.bracketMatches.filter(
      (match) => match.status === "ready" && match.customMatchId === null,
    ),
    snapshot: activeSnapshot,
  };
}

export async function advanceTournamentBracketMatch(
  database: DbClient,
  input: {
    bracketMatchId: number;
    winnerEntryId: number;
    loserEntryId: number;
    finalStatus: Extract<TournamentBracketMatchStatus, "completed" | "forfeit">;
  },
): Promise<TournamentAdvanceResult> {
  const currentMatch = await getTournamentBracketMatch(database, input.bracketMatchId);
  if (!currentMatch) {
    throw new Error("Tournament bracket match not found");
  }

  await updateTournamentBracketMatch(database, {
    bracketMatchId: currentMatch.id,
    status: input.finalStatus,
    winnerEntryId: input.winnerEntryId,
    loserEntryId: input.loserEntryId,
  });

  if (currentMatch.winnerToMatchId && currentMatch.winnerToSlot) {
    await assignEntryToTargetMatch(database, {
      bracketMatchId: currentMatch.winnerToMatchId,
      slot: currentMatch.winnerToSlot as TournamentBracketSlot,
      entryId: input.winnerEntryId,
    });
  }

  if (currentMatch.loserToMatchId && currentMatch.loserToSlot) {
    await assignEntryToTargetMatch(database, {
      bracketMatchId: currentMatch.loserToMatchId,
      slot: currentMatch.loserToSlot as TournamentBracketSlot,
      entryId: input.loserEntryId,
    });
  } else {
    await updateTournamentEntry(database, {
      entryId: input.loserEntryId,
      status: "eliminated",
      eliminatedAt: Date.now(),
    });
  }

  if (!currentMatch.winnerToMatchId) {
    await updateTournamentEntry(database, {
      entryId: input.winnerEntryId,
      status: "champion",
    });
    await updateTournament(database, {
      tournamentId: currentMatch.tournamentId,
      status: "completed",
      completedAt: Date.now(),
      winnerEntryId: input.winnerEntryId,
    });
  }

  const snapshot = await getTournamentStatusSnapshot(database, currentMatch.tournamentId);
  if (!snapshot) {
    throw new Error("Tournament failed to reload after match advancement");
  }

  return {
    completedTournament: snapshot.tournament.status === "completed",
    readyBracketMatches: snapshot.bracketMatches.filter(
      (match) => match.status === "ready" && match.customMatchId === null,
    ),
    snapshot,
  };
}

export async function listOverdueTournamentStarts(
  database: DbClient | null | undefined,
  nowMs = Date.now(),
): Promise<TournamentRecord[]> {
  return listOverdueTournamentsDueToAutoStart(database, nowMs);
}
