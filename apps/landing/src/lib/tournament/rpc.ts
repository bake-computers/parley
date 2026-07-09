import type { EngineTransportEnv } from "../engine/transport.js";
import { resolveEngineTransport } from "../engine/transport.js";

type RpcError = { code?: string; message?: string };

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
