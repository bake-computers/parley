import { ConnectError } from "@connectrpc/connect";
import { err, ok, type Result } from "neverthrow";
import type {
  GuildNotificationSettings as ProtoNotificationSettings,
  GuildNotificationSettingsResponse,
} from "@parley/proto";
import { Game } from "@parley/proto";

export function invokeGetNotificationSettings(
  client: {
    getNotificationSettings: (req: unknown) => Promise<GuildNotificationSettingsResponse>;
  },
  guildId: string,
): Promise<Result<GuildNotificationSettingsResponse, ConnectError>> {
  return wrap(client.getNotificationSettings({ guildId, game: Game.R6 } as never));
}

export function invokeUpsertNotificationSettings(
  client: {
    upsertNotificationSettings: (req: unknown) => Promise<GuildNotificationSettingsResponse>;
  },
  settings: ProtoNotificationSettings,
): Promise<Result<GuildNotificationSettingsResponse, ConnectError>> {
  return wrap(client.upsertNotificationSettings({ settings } as never));
}

function wrap<TRes>(p: Promise<TRes>): Promise<Result<TRes, ConnectError>> {
  return p.then(
    (response) => ok(response),
    (cause: unknown) =>
      err(cause instanceof ConnectError ? cause : new ConnectError(String(cause), 13, {})),
  );
}
