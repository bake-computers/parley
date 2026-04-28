import type { KVNamespace } from "@cloudflare/workers-types";
import type { CachedGuildRosterMember } from "../guild/rosterCache";
import type { ParsedPlayerResult } from "./results";

const TEAM_DRAFT_STATE_PREFIX = "team:draft:v1";
const TEAM_RESULT_SESSION_PREFIX = "team:results:v1";
const TEAM_STATE_TTL_SECONDS = 30 * 60;

export interface TeamDraftState {
  draftId: string;
  guildId: string;
  channelId: string;
  creatorId: string;
  mode: "internal" | "matchmaking";
  minPlayers: number;
  maxPlayers: number;
  selectedDiscordUserIds: string[];
  invalidSelectedDiscordUserIds: string[];
  members: CachedGuildRosterMember[];
}

export interface TeamResultSessionState {
  matchId: number;
  guildId: string;
  submitterId: string;
  teamAResults: Record<string, ParsedPlayerResult>;
}

function buildDraftStateKey(draftId: string): string {
  return `${TEAM_DRAFT_STATE_PREFIX}:${draftId}`;
}

function buildResultSessionKey(matchId: number): string {
  return `${TEAM_RESULT_SESSION_PREFIX}:${matchId}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readTeamDraftState(
  cache: KVNamespace | null | undefined,
  draftId: string,
): Promise<TeamDraftState | null> {
  if (!cache) {
    return null;
  }

  try {
    const raw = await cache.get(buildDraftStateKey(draftId), "text");
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (
      !isObject(parsed) ||
      typeof parsed.draftId !== "string" ||
      typeof parsed.guildId !== "string" ||
      typeof parsed.channelId !== "string" ||
      typeof parsed.creatorId !== "string" ||
      (parsed.mode !== "internal" && parsed.mode !== "matchmaking") ||
      typeof parsed.minPlayers !== "number" ||
      typeof parsed.maxPlayers !== "number" ||
      !Array.isArray(parsed.selectedDiscordUserIds) ||
      !Array.isArray(parsed.invalidSelectedDiscordUserIds) ||
      !Array.isArray(parsed.members)
    ) {
      return null;
    }

    return {
      draftId: parsed.draftId,
      guildId: parsed.guildId,
      channelId: parsed.channelId,
      creatorId: parsed.creatorId,
      mode: parsed.mode,
      minPlayers: parsed.minPlayers,
      maxPlayers: parsed.maxPlayers,
      selectedDiscordUserIds: parsed.selectedDiscordUserIds.filter(
        (value): value is string => typeof value === "string",
      ),
      invalidSelectedDiscordUserIds: parsed.invalidSelectedDiscordUserIds.filter(
        (value): value is string => typeof value === "string",
      ),
      members: parsed.members.filter(isObject) as unknown as CachedGuildRosterMember[],
    };
  } catch {
    return null;
  }
}

export async function writeTeamDraftState(
  cache: KVNamespace | null | undefined,
  draftId: string,
  state: TeamDraftState,
): Promise<void> {
  if (!cache) {
    return;
  }

  await cache.put(buildDraftStateKey(draftId), JSON.stringify(state), {
    expirationTtl: TEAM_STATE_TTL_SECONDS,
  });
}

export async function deleteTeamDraftState(
  cache: KVNamespace | null | undefined,
  draftId: string,
): Promise<void> {
  if (!cache) {
    return;
  }

  await cache.delete(buildDraftStateKey(draftId));
}

export async function readTeamResultSession(
  cache: KVNamespace | null | undefined,
  matchId: number,
): Promise<TeamResultSessionState | null> {
  if (!cache) {
    return null;
  }

  try {
    const raw = await cache.get(buildResultSessionKey(matchId), "text");
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (
      !isObject(parsed) ||
      typeof parsed.matchId !== "number" ||
      typeof parsed.guildId !== "string" ||
      typeof parsed.submitterId !== "string" ||
      !isObject(parsed.teamAResults)
    ) {
      return null;
    }

    const teamAResults: Record<string, ParsedPlayerResult> = {};
    for (const [discordUserId, value] of Object.entries(parsed.teamAResults)) {
      if (isObject(value) && typeof value.kills === "number" && typeof value.deaths === "number") {
        teamAResults[discordUserId] = {
          kills: value.kills,
          deaths: value.deaths,
        };
      }
    }

    return {
      matchId: parsed.matchId,
      guildId: parsed.guildId,
      submitterId: parsed.submitterId,
      teamAResults,
    };
  } catch {
    return null;
  }
}

export async function writeTeamResultSession(
  cache: KVNamespace | null | undefined,
  state: TeamResultSessionState,
): Promise<void> {
  if (!cache) {
    return;
  }

  await cache.put(buildResultSessionKey(state.matchId), JSON.stringify(state), {
    expirationTtl: TEAM_STATE_TTL_SECONDS,
  });
}

export async function deleteTeamResultSession(
  cache: KVNamespace | null | undefined,
  matchId: number,
): Promise<void> {
  if (!cache) {
    return;
  }

  await cache.delete(buildResultSessionKey(matchId));
}
