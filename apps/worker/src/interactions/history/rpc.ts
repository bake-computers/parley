import type { ListMatchesResponse } from "@parley/proto/matchmaking/v1/matchmaking_pb.js";
import { ConnectError } from "@connectrpc/connect";
import { err, ok, type Result } from "neverthrow";
import { getMatchmakingClient, type EngineTransportEnv } from "../../transport.js";
import type { Game } from "@parley/proto";

export type InvokeListMatchesInput = {
  env: EngineTransportEnv;
  guildId: string;
  game: Game;
  limit: number;
  cursor: string;
};

type MatchmakingClient = {
  listMatches: (req: {
    guildId: string;
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
export function invokeListMatches(
  input: InvokeListMatchesInput,
): Promise<Result<ListMatchesResponse, ConnectError>> {
  const client = getMatchmakingClient(input.env) as unknown as MatchmakingClient;
  return client
    .listMatches({
      guildId: input.guildId,
      game: input.game,
      limit: input.limit,
      cursor: input.cursor,
    })
    .then(
      (response) => ok(response),
      (cause: unknown) =>
        err(
          cause instanceof ConnectError
            ? cause
            : new ConnectError(String(cause), 13, {}),
        ),
    );
}
