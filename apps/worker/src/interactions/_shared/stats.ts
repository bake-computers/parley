import type { FetchStatsResponse } from "@parley/proto/stats/v1/stats_pb.js";
import { Game, StatsPlatform } from "@parley/proto";
import { ConnectError } from "@connectrpc/connect";
import { err, ok, type Result } from "neverthrow";
import { getStatsClient, type EngineTransportEnv } from "#/transport";

export type FetchStatsPlatform = "pc" | "xbox" | "playstation";

export type ExecuteFetchStatsInput = {
  context: { env: unknown };
  username: string;
  platform: FetchStatsPlatform;
};

type FetchStatsArgs = {
  username: string;
  platform: StatsPlatform;
  game: Game;
};

type StatsClient = {
  fetchStats: (req: FetchStatsArgs) => Promise<FetchStatsResponse>;
};

export function platformToStatsPlatform(platform: FetchStatsPlatform): StatsPlatform {
  switch (platform) {
    case "pc":
      return StatsPlatform.PC;
    case "xbox":
      return StatsPlatform.XBOX;
    case "playstation":
      return StatsPlatform.PLAYSTATION;
  }
}

export function executeFetchStats(
  input: ExecuteFetchStatsInput,
): Promise<Result<FetchStatsResponse, ConnectError>> {
  const env = input.context.env as EngineTransportEnv;
  const client = getStatsClient(env) as unknown as StatsClient;
  const args: FetchStatsArgs = {
    username: input.username,
    platform: platformToStatsPlatform(input.platform),
    game: Game.R6,
  };
  return invokeFetchStats(client, args);
}

export function invokeFetchStats(
  client: StatsClient,
  args: FetchStatsArgs,
): Promise<Result<FetchStatsResponse, ConnectError>> {
  return client.fetchStats(args).then(
    (response) => ok(response),
    (cause: unknown) =>
      err(cause instanceof ConnectError ? cause : new ConnectError(String(cause), 13, {})),
  );
}
