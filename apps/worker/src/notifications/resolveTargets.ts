import type {
  NotifyPayload,
  NotifyTarget,
  NotificationEvent,
  NotificationSettings,
} from "./types.js";

/**
 * Match event types route to match_results_channel.
 */
const MATCH_EVENTS: ReadonlySet<NotificationEvent> = new Set<NotificationEvent>([
  "match.ready",
  "match.result",
]);

/**
 * Tournament event types route to tournament_announcements_channel.
 */
const TOURNAMENT_EVENTS: ReadonlySet<NotificationEvent> = new Set<NotificationEvent>([
  "tournament.registration_open",
  "tournament.started",
  "tournament.round",
  "tournament.champion",
]);

function isMatchEvent(event: NotificationEvent): boolean {
  return MATCH_EVENTS.has(event);
}

function isTournamentEvent(event: NotificationEvent): boolean {
  return TOURNAMENT_EVENTS.has(event);
}

/**
 * Returns the channel id to use for a given event + settings pair,
 * or undefined if the event is disabled or no channel is configured.
 */
function resolveChannelForEvent(
  settings: NotificationSettings,
  event: NotificationEvent,
): string | undefined {
  if (isMatchEvent(event)) {
    if (event === "match.ready" && !settings.announceMatchReadyEnabled) {
      return undefined;
    }
    if (event === "match.result" && !settings.announceMatchResultsEnabled) {
      return undefined;
    }
    const ch = settings.matchResultsChannel;
    return ch.length > 0 ? ch : undefined;
  }

  if (isTournamentEvent(event)) {
    const ch = settings.tournamentAnnouncementsChannel;
    return ch.length > 0 ? ch : undefined;
  }

  return undefined;
}

/**
 * Resolve the list of (guildId, channelId) targets for a notification.
 *
 * Always includes the host guild if its channel is configured and the
 * relevant toggle is enabled. When cross-guild announcements are enabled,
 * also includes participant guilds (excluding the host to avoid duplicates).
 *
 * The caller must supply a `getSettings` callback that returns settings
 * for a given guildId — this avoids the notification module importing
 * transport/clients directly.
 */
export function resolveTargets(
  payload: NotifyPayload,
  hostSettings: NotificationSettings,
  getSettings: (guildId: string) => NotificationSettings | undefined,
): readonly NotifyTarget[] {
  const targets: NotifyTarget[] = [];

  // Host guild — always attempted first.
  const hostChannel = resolveChannelForEvent(hostSettings, payload.event);
  if (hostChannel !== undefined) {
    targets.push({ guildId: payload.host_guild_id, channelId: hostChannel });
  }

  // Cross-guild: participant guilds (host excluded) when flag is on.
  if (hostSettings.crossGuildAnnouncementsEnabled) {
    for (const guildId of payload.participant_guild_ids) {
      if (guildId === payload.host_guild_id) {
        continue;
      }

      const settings = getSettings(guildId);
      if (settings === undefined) {
        continue;
      }

      const channel = resolveChannelForEvent(settings, payload.event);
      if (channel !== undefined) {
        targets.push({ guildId, channelId: channel });
      }
    }
  }

  return targets;
}
