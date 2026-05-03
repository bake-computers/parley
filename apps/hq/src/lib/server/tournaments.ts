import { eq, desc, asc } from "drizzle-orm";
import { tournaments, tournamentEntries, tournamentBracketMatches } from "@parley/db/schema";
import { withDb } from "./db";
import { readDashboardSession } from "./auth";

interface TournamentListRow {
  id: number;
  name: string;
  format: string;
  teamCap: number;
  visibility: string;
  status: string;
  createdByGuildId: string;
  createdByChannelId: string;
  createdByDiscordUserId: string;
  hubMessageId: string | null;
  filledAt: number | null;
  autoStartAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  winnerEntryId: number | null;
  createdAt: number;
  updatedAt: number;
  entryCount: number;
}

interface TournamentDetailRow {
  id: number;
  name: string;
  format: string;
  teamCap: number;
  visibility: string;
  status: string;
  createdByGuildId: string;
  createdByChannelId: string;
  createdByDiscordUserId: string;
  hubMessageId: string | null;
  filledAt: number | null;
  autoStartAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  winnerEntryId: number | null;
  createdAt: number;
  updatedAt: number;
}

interface TournamentEntryRow {
  id: number;
  tournamentId: number;
  guildId: string;
  channelId: string;
  captainDiscordUserId: string;
  teamName: string;
  status: string;
  seedNumber: number | null;
  stackBalanceTotal: number;
  stackBalanceAverage: number;
  joinedAt: number;
  eliminatedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface BracketMatchRow {
  id: number;
  tournamentId: number;
  bracket: string;
  roundNumber: number;
  matchNumber: number;
  status: string;
  entryAId: number | null;
  entryBId: number | null;
  winnerEntryId: number | null;
  loserEntryId: number | null;
  winnerToMatchId: number | null;
  winnerToSlot: string | null;
  loserToMatchId: number | null;
  loserToSlot: string | null;
  customMatchId: number | null;
  createdAt: number;
  updatedAt: number;
  entryATeamName: string | null;
  entryBTeamName: string | null;
  entryACaptainDiscordUserId: string | null;
  entryBCaptainDiscordUserId: string | null;
}

interface TournamentDetail {
  tournament: TournamentDetailRow;
  entries: TournamentEntryRow[];
  bracketMatches: BracketMatchRow[];
}

export async function getGuildTournaments(
  headers: Headers,
  guildId: string,
): Promise<TournamentListRow[]> {
  return withDb(async (db) => {
    const access = await readDashboardSession(db, headers);
    if (access.status !== "authorized") {
      throw new Error("Unauthorized");
    }

    const tournamentRows = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        format: tournaments.format,
        teamCap: tournaments.teamCap,
        visibility: tournaments.visibility,
        status: tournaments.status,
        createdByGuildId: tournaments.createdByGuildId,
        createdByChannelId: tournaments.createdByChannelId,
        createdByDiscordUserId: tournaments.createdByDiscordUserId,
        hubMessageId: tournaments.hubMessageId,
        filledAt: tournaments.filledAt,
        autoStartAt: tournaments.autoStartAt,
        startedAt: tournaments.startedAt,
        completedAt: tournaments.completedAt,
        winnerEntryId: tournaments.winnerEntryId,
        createdAt: tournaments.createdAt,
        updatedAt: tournaments.updatedAt,
      })
      .from(tournaments)
      .where(eq(tournaments.createdByGuildId, guildId))
      .orderBy(desc(tournaments.createdAt))
      .limit(50);

    const tournamentIds = tournamentRows.map((t) => t.id);

    if (tournamentIds.length === 0) {
      return [];
    }

    const entryCounts = await db
      .select({
        tournamentId: tournamentEntries.tournamentId,
      })
      .from(tournamentEntries)
      .where(eq(tournamentEntries.tournamentId, tournamentIds[0]!));

    const entryCountByTournament = new Map<number, number>();
    for (const row of entryCounts) {
      const current = entryCountByTournament.get(row.tournamentId) ?? 0;
      entryCountByTournament.set(row.tournamentId, current + 1);
    }

    return tournamentRows.map((t) => ({
      ...t,
      entryCount: entryCountByTournament.get(t.id) ?? 0,
    }));
  }).catch(() => []);
}

export async function getTournamentDetail(
  headers: Headers,
  tournamentId: number,
): Promise<TournamentDetail | null> {
  return withDb(async (db) => {
    const access = await readDashboardSession(db, headers);
    if (access.status !== "authorized") {
      throw new Error("Unauthorized");
    }

    const tournamentRows = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        format: tournaments.format,
        teamCap: tournaments.teamCap,
        visibility: tournaments.visibility,
        status: tournaments.status,
        createdByGuildId: tournaments.createdByGuildId,
        createdByChannelId: tournaments.createdByChannelId,
        createdByDiscordUserId: tournaments.createdByDiscordUserId,
        hubMessageId: tournaments.hubMessageId,
        filledAt: tournaments.filledAt,
        autoStartAt: tournaments.autoStartAt,
        startedAt: tournaments.startedAt,
        completedAt: tournaments.completedAt,
        winnerEntryId: tournaments.winnerEntryId,
        createdAt: tournaments.createdAt,
        updatedAt: tournaments.updatedAt,
      })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);

    const tournament = tournamentRows[0];
    if (!tournament) {
      return null;
    }

    const entryRows = await db
      .select({
        id: tournamentEntries.id,
        tournamentId: tournamentEntries.tournamentId,
        guildId: tournamentEntries.guildId,
        channelId: tournamentEntries.channelId,
        captainDiscordUserId: tournamentEntries.captainDiscordUserId,
        teamName: tournamentEntries.teamName,
        status: tournamentEntries.status,
        seedNumber: tournamentEntries.seedNumber,
        stackBalanceTotal: tournamentEntries.stackBalanceTotal,
        stackBalanceAverage: tournamentEntries.stackBalanceAverage,
        joinedAt: tournamentEntries.joinedAt,
        eliminatedAt: tournamentEntries.eliminatedAt,
        createdAt: tournamentEntries.createdAt,
        updatedAt: tournamentEntries.updatedAt,
      })
      .from(tournamentEntries)
      .where(eq(tournamentEntries.tournamentId, tournamentId))
      .orderBy(asc(tournamentEntries.seedNumber));

    const bracketRows = await db
      .select({
        id: tournamentBracketMatches.id,
        tournamentId: tournamentBracketMatches.tournamentId,
        bracket: tournamentBracketMatches.bracket,
        roundNumber: tournamentBracketMatches.roundNumber,
        matchNumber: tournamentBracketMatches.matchNumber,
        status: tournamentBracketMatches.status,
        entryAId: tournamentBracketMatches.entryAId,
        entryBId: tournamentBracketMatches.entryBId,
        winnerEntryId: tournamentBracketMatches.winnerEntryId,
        loserEntryId: tournamentBracketMatches.loserEntryId,
        winnerToMatchId: tournamentBracketMatches.winnerToMatchId,
        winnerToSlot: tournamentBracketMatches.winnerToSlot,
        loserToMatchId: tournamentBracketMatches.loserToMatchId,
        loserToSlot: tournamentBracketMatches.loserToSlot,
        customMatchId: tournamentBracketMatches.customMatchId,
        createdAt: tournamentBracketMatches.createdAt,
        updatedAt: tournamentBracketMatches.updatedAt,
      })
      .from(tournamentBracketMatches)
      .where(eq(tournamentBracketMatches.tournamentId, tournamentId))
      .orderBy(
        asc(tournamentBracketMatches.bracket),
        asc(tournamentBracketMatches.roundNumber),
        asc(tournamentBracketMatches.matchNumber),
      );

    const entryIds = [
      ...bracketRows.map((b) => b.entryAId).filter((id): id is number => id !== null),
      ...bracketRows.map((b) => b.entryBId).filter((id): id is number => id !== null),
      ...bracketRows.map((b) => b.winnerEntryId).filter((id): id is number => id !== null),
      ...bracketRows.map((b) => b.loserEntryId).filter((id): id is number => id !== null),
    ];

    const uniqueEntryIds = [...new Set(entryIds)];

    let entryTeamNames = new Map<number, { teamName: string; captainDiscordUserId: string }>();
    if (uniqueEntryIds.length > 0) {
      const entryDetails = await db
        .select({
          id: tournamentEntries.id,
          teamName: tournamentEntries.teamName,
          captainDiscordUserId: tournamentEntries.captainDiscordUserId,
        })
        .from(tournamentEntries)
        .where(eq(tournamentEntries.id, uniqueEntryIds[0]!));

      for (const entry of entryDetails) {
        entryTeamNames.set(entry.id, {
          teamName: entry.teamName,
          captainDiscordUserId: entry.captainDiscordUserId,
        });
      }
    }

    const bracketMatches: BracketMatchRow[] = bracketRows.map((b) => {
      const entryA = b.entryAId !== null ? entryTeamNames.get(b.entryAId) : null;
      const entryB = b.entryBId !== null ? entryTeamNames.get(b.entryBId) : null;
      return {
        ...b,
        entryATeamName: entryA?.teamName ?? null,
        entryBTeamName: entryB?.teamName ?? null,
        entryACaptainDiscordUserId: entryA?.captainDiscordUserId ?? null,
        entryBCaptainDiscordUserId: entryB?.captainDiscordUserId ?? null,
      };
    });

    return {
      tournament,
      entries: entryRows,
      bracketMatches,
    };
  }).catch(() => null);
}
