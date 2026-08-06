import type { EngineTransportEnv, RpcError } from "../engine/transport.js";
import { readEngineResponse, resolveEngineTransport } from "../engine/transport.js";

const ACTING_USER_HEADER = "X-Parley-Acting-Discord-User-Id";
const TOURNAMENT_SERVICE = "parley.tournament.v1.TournamentService";
const MATCHMAKING_SERVICE = "parley.matchmaking.v1.MatchmakingService";

export type BracketMatchJson = {
  id: number;
  bracket: string;
  roundNumber: number;
  matchNumber: number;
  status: string;
  teamAId?: number;
  teamBId?: number;
  winnerTeamId?: number;
};

export type TournamentJson = {
  id: number;
  name: string;
  format: string;
  teamCap: number;
  status: string;
  publicCode: string;
  minTeams: number;
  createdByGuildId: string;
  createdByChannelId: string;
  createdByDiscordUserId: string;
  teams: Array<{ id: number; teamName: string; captainDiscordUserId: string; status: string }>;
  bracketMatches: BracketMatchJson[];
};

export type GuildMemberJson = {
  discordUserId: string;
  username: string;
  platform: string;
};

function normalizeTournament(tournament: TournamentJson): TournamentJson {
  return {
    ...tournament,
    teams: tournament.teams ?? [],
    bracketMatches: tournament.bracketMatches ?? [],
  };
}

export type CreateTournamentRpcRequest = {
  guildId: string;
  channelId: string;
  createdByDiscordUserId: string;
  game: 1;
  name: string;
  format: string;
  teamCap: number;
  rulesText: string;
};

export type CreatedTournament = {
  id: number;
  name: string;
  publicCode: string;
};

async function tournamentCall<T>(
  env: EngineTransportEnv,
  service: string,
  method: string,
  body: unknown,
  actingDiscordUserId?: string,
): Promise<T> {
  const { baseUrl, fetchImpl } = resolveEngineTransport(env);
  const headers = new Headers({ "content-type": "application/json" });
  const actingUserId = actingDiscordUserId?.trim();
  if (actingUserId) {
    headers.set(ACTING_USER_HEADER, actingUserId);
  }
  const res = await fetchImpl(new URL(`/${service}/${method}`, baseUrl).href, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return readEngineResponse<T>(res);
}

export async function rpcGetTournamentByCode(
  env: EngineTransportEnv,
  publicCode: string,
): Promise<TournamentJson> {
  const json = await tournamentCall<{ success?: boolean; tournament?: TournamentJson }>(
    env,
    TOURNAMENT_SERVICE,
    "GetTournamentByCode",
    { publicCode, game: 1 },
  );
  if (!json.success || !json.tournament) {
    throw new Error("Tournament not found");
  }
  return normalizeTournament(json.tournament);
}

export async function rpcRegisterTeam(
  env: EngineTransportEnv,
  body: Record<string, unknown>,
  actingDiscordUserId?: string,
): Promise<void> {
  const json = await tournamentCall<{ success?: boolean }>(
    env,
    TOURNAMENT_SERVICE,
    "RegisterTeam",
    body,
    actingDiscordUserId,
  );
  if (!json.success) {
    throw new Error("Team registration failed");
  }
}

export async function rpcTournamentAction(
  env: EngineTransportEnv,
  method: "StartTournament" | "CancelTournament" | "ReportBracketResult",
  body: Record<string, unknown>,
  actingDiscordUserId?: string,
): Promise<TournamentJson> {
  const json = await tournamentCall<{ success?: boolean; tournament?: TournamentJson }>(
    env,
    TOURNAMENT_SERVICE,
    method,
    body,
    actingDiscordUserId,
  );
  if (!json.success || !json.tournament) {
    throw new Error("Tournament update failed");
  }
  return normalizeTournament(json.tournament);
}

export async function rpcCreateTournament(
  env: EngineTransportEnv,
  request: CreateTournamentRpcRequest,
  actingDiscordUserId?: string,
): Promise<CreatedTournament> {
  const json = await tournamentCall<{
    success?: boolean;
    tournament?: CreatedTournament;
    error?: RpcError;
  }>(env, TOURNAMENT_SERVICE, "CreateTournament", request, actingDiscordUserId);
  if (!json.success || !json.tournament?.publicCode) {
    throw new Error(json.error?.message ?? "Tournament creation failed");
  }
  return json.tournament;
}

export async function rpcListGuildMembers(
  env: EngineTransportEnv,
  guildId: string,
): Promise<GuildMemberJson[]> {
  const json = await tournamentCall<{
    success?: boolean;
    members?: GuildMemberJson[];
  }>(env, MATCHMAKING_SERVICE, "ListGuildMembers", {
    guildId,
    game: 1,
    limit: 2000,
  });
  if (!json.success) {
    throw new Error("Could not load eligible players");
  }
  return json.members ?? [];
}
