import type { LinkAccountResponse } from "@parley/proto/identity/v1/identity_pb.js";
import type { FetchStatsResponse } from "@parley/proto/stats/v1/stats_pb.js";
import { Game, StatsPlatform } from "@parley/proto";
import { ConnectError } from "@connectrpc/connect";
import { err, ok, type Result } from "neverthrow";
import { getIdentityClient, getStatsClient, type EngineTransportEnv } from "../../transport.js";
import type { Platform } from "./constants.js";

type LinkInteractionContext = {
  context: { env: unknown };
  user?: { id?: string } | undefined;
  guildId?: string | undefined;
};

export type ExecuteLinkAccountInput = {
  context: LinkInteractionContext["context"];
  user: LinkInteractionContext["user"];
  guildId: LinkInteractionContext["guildId"];
  platform: Platform;
  username: string;
};

type LinkAccountArgs = {
  discordUserId: string;
  game: Game;
  username: string;
  platform: string;
  guildId?: string;
};

type IdentityClient = {
  linkAccount: (req: LinkAccountArgs) => Promise<LinkAccountResponse>;
};

export type ExecuteFetchStatsInput = {
  context: LinkInteractionContext["context"];
  username: string;
  platform: Platform;
};

type FetchStatsArgs = {
  username: string;
  platform: StatsPlatform;
  game: Game;
};

type StatsClient = {
  fetchStats: (req: FetchStatsArgs) => Promise<FetchStatsResponse>;
};

/**
 * Resolve the IdentityService client from the request env and call LinkAccount.
 *
 * The username passed here is the in-game name collected by the username modal
 * in {@link link/modal.ts} — not the Discord user id (the previous version
 * conflated the two and submitted the snowflake as the username, which the
 * engine could never match).
 *
 * Connect's client throws {@link ConnectError} on non-2xx responses rather
 * than returning a `Result`, so we wrap the call and convert any throw into
 * an `Err` for the caller.
 *
 * @param {ExecuteLinkAccountInput} input - The interaction context, platform, and username to link.
 * @returns {Promise<Result<LinkAccountResponse, ConnectError>>} The engine response.
 */
export function executeLinkAccount(
  input: ExecuteLinkAccountInput,
): Promise<Result<LinkAccountResponse, ConnectError>> {
  const env = input.context.env as EngineTransportEnv;
  const client = getIdentityClient(env) as unknown as IdentityClient;
  const args: LinkAccountArgs = {
    discordUserId: input.user?.id ?? "",
    game: Game.R6,
    username: input.username,
    platform: input.platform,
    ...(input.guildId === undefined ? {} : { guildId: input.guildId }),
  };
  return invokeLinkAccount(client, args);
}

/**
 * Resolve the StatsService client and call FetchStats. This is what triggers
 * the engine to scrape stats.cc and persist a `player_stat_snapshots` row
 * for the linked account — without it, /profile and matchmaking have
 * nothing to balance on.
 *
 * @param {ExecuteFetchStatsInput} input - The username, platform, and request env.
 * @returns {Promise<Result<FetchStatsResponse, ConnectError>>} The scraped stats.
 */
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

/**
 * Pure wrapper around an IdentityService client. Exported separately from
 * {@link executeLinkAccount} so tests can drive it with a fake client.
 */
export function invokeLinkAccount(
  client: IdentityClient,
  args: LinkAccountArgs,
): Promise<Result<LinkAccountResponse, ConnectError>> {
  return client.linkAccount(args).then(
    (response) => ok(response),
    (cause: unknown) =>
      err(cause instanceof ConnectError ? cause : new ConnectError(String(cause), 13, {})),
  );
}

/**
 * Pure wrapper around a StatsService client. Exported separately from
 * {@link executeFetchStats} so tests can drive it with a fake client.
 */
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

/**
 * Maps the link wizard's platform identifiers to the StatsService enum.
 * Falls back to PC — should be unreachable for valid wizard input.
 */
export function platformToStatsPlatform(platform: Platform): StatsPlatform {
  switch (platform) {
    case "pc":
      return StatsPlatform.PC;
    case "xbox":
      return StatsPlatform.XBOX;
    case "playstation":
      return StatsPlatform.PLAYSTATION;
  }
}
