import type {
  LinkAccountResponse,
  UnlinkAccountResponse,
} from "@parley/proto/identity/v1/identity_pb.js";
import { Game } from "@parley/proto";
import { ConnectError } from "@connectrpc/connect";
import { err, ok, type Result } from "@parley/runtime";
import { getIdentityClient, type EngineTransportEnv } from "#/transport";
import type { Platform } from "#/interactions/link/constants";

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

type UnlinkAccountArgs = {
  discordUserId: string;
  game: Game;
  platform?: string;
};

type IdentityClient = {
  linkAccount: (req: LinkAccountArgs) => Promise<LinkAccountResponse>;
  unlinkAccount: (req: UnlinkAccountArgs) => Promise<UnlinkAccountResponse>;
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

export function executeUnlinkAccount(input: {
  context: LinkInteractionContext["context"];
  user: LinkInteractionContext["user"];
  platform?: Platform;
}): Promise<Result<UnlinkAccountResponse, ConnectError>> {
  const env = input.context.env as EngineTransportEnv;
  const client = getIdentityClient(env) as unknown as IdentityClient;
  return invokeUnlinkAccount(client, {
    discordUserId: input.user?.id ?? "",
    game: Game.R6,
    ...(input.platform !== undefined && { platform: input.platform }),
  });
}

export function invokeUnlinkAccount(
  client: IdentityClient,
  args: UnlinkAccountArgs,
): Promise<Result<UnlinkAccountResponse, ConnectError>> {
  return client.unlinkAccount(args).then(
    (response) => ok(response),
    (cause: unknown) =>
      err(cause instanceof ConnectError ? cause : new ConnectError(String(cause), 13, {})),
  );
}

export {
  executeFetchStats,
  invokeFetchStats,
  platformToStatsPlatform,
  type FetchStatsPlatform,
  type ExecuteFetchStatsInput,
} from "#/utils/stats";
