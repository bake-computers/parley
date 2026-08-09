import type {
  CreateCustomMatchResponse,
  GetMatchResponse,
  ReportMatchResultResponse,
  ReportPlayerRoundStatsResponse,
} from "@parley/proto/matchmaking/v1/matchmaking_pb.js";
import { ConnectError } from "@connectrpc/connect";
import { err, ok, type Result } from "@parley/runtime";
import { getMatchmakingClient, type EngineTransportEnv } from "#/transport";
import type { Game } from "@parley/proto";

export type RoundStatInput = {
  discordUserId: string;
  kills: number;
  deaths: number;
  assists: number;
};

type MatchmakingClient = {
  createCustomMatch: (req: {
    guildId: string;
    channelId: string;
    createdByDiscordUserId: string;
    game: Game;
    discordUserIds: string[];
    teamSize: number;
  }) => Promise<CreateCustomMatchResponse>;
  getMatch: (req: { matchId: number; game: Game }) => Promise<GetMatchResponse>;
  reportPlayerRoundStats: (req: {
    matchId: number;
    game: Game;
    stats: RoundStatInput[];
    reportedByDiscordUserId: string;
  }) => Promise<ReportPlayerRoundStatsResponse>;
  reportMatchResult: (req: {
    matchId: number;
    game: Game;
    winningTeam: string;
    reportedByDiscordUserId: string;
  }) => Promise<ReportMatchResultResponse>;
};

function wrap<TRes>(p: Promise<TRes>): Promise<Result<TRes, ConnectError>> {
  return p.then(
    (response) => ok(response),
    (cause: unknown) =>
      err(cause instanceof ConnectError ? cause : new ConnectError(String(cause), 13, {})),
  );
}

function client(env: EngineTransportEnv): MatchmakingClient {
  return getMatchmakingClient(env) as unknown as MatchmakingClient;
}

export function invokeCreateCustomMatch(
  env: EngineTransportEnv,
  req: {
    guildId: string;
    channelId: string;
    createdByDiscordUserId: string;
    game: Game;
    discordUserIds: string[];
    teamSize: number;
  },
): Promise<Result<CreateCustomMatchResponse, ConnectError>> {
  return wrap(client(env).createCustomMatch(req));
}

export function invokeGetMatch(
  env: EngineTransportEnv,
  matchId: number,
  game: Game,
): Promise<Result<GetMatchResponse, ConnectError>> {
  return wrap(client(env).getMatch({ matchId, game }));
}

export function invokeReportPlayerRoundStats(
  env: EngineTransportEnv,
  req: { matchId: number; game: Game; stats: RoundStatInput[]; reportedByDiscordUserId: string },
): Promise<Result<ReportPlayerRoundStatsResponse, ConnectError>> {
  return wrap(client(env).reportPlayerRoundStats(req));
}

export function invokeReportMatchResult(
  env: EngineTransportEnv,
  req: { matchId: number; game: Game; winningTeam: string; reportedByDiscordUserId: string },
): Promise<Result<ReportMatchResultResponse, ConnectError>> {
  return wrap(client(env).reportMatchResult(req));
}
