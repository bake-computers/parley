import { mock, type Mock } from "bun:test";
import { type Result } from "neverthrow";
import type { ConnectError } from "@connectrpc/connect";
import type {
  LinkAccountRequest,
  LinkAccountResponse,
  LookupByDiscordRequest,
  LookupByDiscordResponse,
} from "@parley/proto/identity/v1/identity_pb.js";

export interface MockIdentityClient {
  linkAccount: Mock<
    (req: LinkAccountRequest) => Promise<Result<LinkAccountResponse, ConnectError>>
  >;
  lookupByDiscord: Mock<
    (req: LookupByDiscordRequest) => Promise<Result<LookupByDiscordResponse, ConnectError>>
  >;
}

export function createMockIdentityClient(): MockIdentityClient {
  return {
    linkAccount:
      mock<(req: LinkAccountRequest) => Promise<Result<LinkAccountResponse, ConnectError>>>(),
    lookupByDiscord:
      mock<
        (req: LookupByDiscordRequest) => Promise<Result<LookupByDiscordResponse, ConnectError>>
      >(),
  };
}
