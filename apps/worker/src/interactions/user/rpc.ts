import { ConnectError } from "@connectrpc/connect";
import { err, ok, type Result } from "neverthrow";
import type {
  DeleteUserDataResponse,
  UserSettings as ProtoUserSettings,
  UserSettingsResponse,
} from "@parley/proto";

type AnyClient = Record<string, (req: unknown) => Promise<unknown>>;

function wrap<TRes>(p: Promise<TRes>): Promise<Result<TRes, ConnectError>> {
  return p.then(
    (response) => ok(response),
    (cause: unknown) =>
      err(cause instanceof ConnectError ? cause : new ConnectError(String(cause), 13, {})),
  );
}

export function invokeGetUserSettings(
  client: { getUserSettings: (req: unknown) => Promise<UserSettingsResponse> },
  discordUserId: string,
): Promise<Result<UserSettingsResponse, ConnectError>> {
  return wrap(client.getUserSettings({ discordUserId } as never));
}

export function invokeUpsertUserSettings(
  client: {
    upsertUserSettings: (req: unknown) => Promise<UserSettingsResponse>;
  },
  settings: ProtoUserSettings,
): Promise<Result<UserSettingsResponse, ConnectError>> {
  return wrap(client.upsertUserSettings({ settings } as never));
}

export function invokeDeleteUserData(
  client: { deleteUserData: (req: unknown) => Promise<DeleteUserDataResponse> },
  discordUserId: string,
): Promise<Result<DeleteUserDataResponse, ConnectError>> {
  return wrap(client.deleteUserData({ discordUserId } as never));
}

export type { AnyClient };
