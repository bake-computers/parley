import type { EngineTransportEnv } from "../engine/transport.js";
import { resolveEngineTransport } from "../engine/transport.js";

type RpcError = { code?: string; message?: string };

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
  method: string,
  body: unknown,
): Promise<T> {
  const { baseUrl, fetchImpl } = resolveEngineTransport(env);
  const res = await fetchImpl(
    new URL(`/parley.tournament.v1.TournamentService/${method}`, baseUrl).href,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  const json = (await res.json()) as T & RpcError & { error?: RpcError };
  if (!res.ok) {
    throw new Error(json.error?.message ?? json.message ?? `Engine ${res.status}`);
  }
  return json;
}

export async function rpcGetTournamentByCode(
  env: EngineTransportEnv,
  publicCode: string,
): Promise<TournamentJson> {
  const json = await tournamentCall<{ success?: boolean; tournament?: TournamentJson }>(
    env,
    "GetTournamentByCode",
    { publicCode, game: 1 },
  );
  if (!json.success || !json.tournament) throw new Error("Tournament not found");
  return normalizeTournament(json.tournament);
}

export async function rpcRegisterTeam(
  env: EngineTransportEnv,
  body: Record<string, unknown>,
): Promise<void> {
  const json = await tournamentCall<{ success?: boolean }>(env, "RegisterTeam", body);
  if (!json.success) throw new Error("Team registration failed");
}

export async function rpcTournamentAction(
  env: EngineTransportEnv,
  method: "StartTournament" | "CancelTournament",
  body: Record<string, unknown>,
): Promise<TournamentJson> {
  const json = await tournamentCall<{ success?: boolean; tournament?: TournamentJson }>(
    env,
    method,
    body,
  );
  if (!json.success || !json.tournament) throw new Error("Tournament update failed");
  return normalizeTournament(json.tournament);
}

export async function rpcCreateTournament(
  env: EngineTransportEnv,
  request: CreateTournamentRpcRequest,
): Promise<CreatedTournament> {
  const { baseUrl, fetchImpl } = resolveEngineTransport(env);
  const res = await fetchImpl(
    new URL("/parley.tournament.v1.TournamentService/CreateTournament", baseUrl).href,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  const json = (await res.json()) as {
    success?: boolean;
    tournament?: CreatedTournament;
    error?: RpcError;
  };
  if (!res.ok || !json.success || !json.tournament?.publicCode) {
    throw new Error(json.error?.message ?? `Engine ${res.status}`);
  }
  return json.tournament;
}
