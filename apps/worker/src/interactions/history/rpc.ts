import type { ListMatchesResponse } from "@parley/proto/matchmaking/v1/matchmaking_pb.js";
import { ConnectError } from "@connectrpc/connect";
import { err, ok, type Result } from "@parley/runtime";
import { getMatchmakingClient, type EngineTransportEnv } from "#/transport";
import type { Game } from "@parley/proto";

export type InvokeListMatchesInput = {
  env: EngineTransportEnv;
  guildId: string;
  discordUserId: string;
  game: Game;
  limit: number;
  cursor: string;
};

type MatchmakingClient = {
  listMatches: (req: {
    guildId: string;
    discordUserId: string;
    game: Game;
    limit: number;
    cursor: string;
  }) => Promise<ListMatchesResponse>;
};

/**
 * Resolve the MatchmakingService client from the request env and call ListMatches.
 *
 * Connect's client throws {@link ConnectError} on non-2xx responses rather
 * than returning a `Result`, so we wrap the call and convert any throw into
 * an `Err` for the caller.
 */
export async function invokeListMatches(
  input: InvokeListMatchesInput,
): Promise<Result<ListMatchesResponse, ConnectError>> {
  const data = (await input.env.KV.get(
    `matchmaking:${input.guildId}:${input.discordUserId}:${input.game}`,
    { type: "json" },
  )) as ListMatchesResponse | null;

  if (!data) {
    return err(new ConnectError("No data found", 5, {}));
  }

  const client = getMatchmakingClient(input.env) as unknown as MatchmakingClient;

  await input.env.KV.put(
    `matchmaking:${input.guildId}:${input.discordUserId}:${input.game}`,
    JSON.stringify(data),
    // we are currently experiencing a lot of 503s from the engine, so cache for 5 minutes to reduce load
    { expirationTtl: 300 },
  );

  return client
    .listMatches({
      guildId: input.guildId,
      discordUserId: input.discordUserId,
      game: input.game,
      limit: input.limit,
      cursor: input.cursor,
    })
    .then(
      (response) => ok(response),
      (cause: unknown) =>
        err(cause instanceof ConnectError ? cause : new ConnectError(String(cause), 13, {})),
    );
}
