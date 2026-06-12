import type { LinkAccountResponse } from "@parley/proto/identity/v1/identity_pb.js";
import { Game } from "@parley/proto";
import type { ConnectError } from "@connectrpc/connect";
import type { Result } from "neverthrow";
import { getIdentityClient, type EngineTransportEnv } from "../../transport.js";
import type { Platform } from "./constants.js";

type LinkInteraction = {
  context: { env: unknown };
  user?: { id: string } | undefined;
  guildId?: string | undefined;
};

type IdentityClient = {
  linkAccount(req: {
    discordUserId: string;
    game: number;
    username: string;
    platform: string;
    guildId?: string;
  }): Promise<Result<LinkAccountResponse, ConnectError>>;
};

export function executeLinkAccount(
  interaction: LinkInteraction,
  platform: Platform,
  username: string,
): Promise<Result<LinkAccountResponse, ConnectError>> {
  const env = interaction.context.env as EngineTransportEnv;
  const identityClient = getIdentityClient(env) as unknown as IdentityClient;
  const discordUserId = interaction.user?.id ?? "";
  const guildId = interaction.guildId;

  return identityClient.linkAccount({
    discordUserId,
    game: Game.R6,
    username,
    platform,
    ...(guildId === undefined ? {} : { guildId }),
  });
}
