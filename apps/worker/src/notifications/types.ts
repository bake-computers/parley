/**
 * Notification event types dispatched from the engine to the worker.
 *
 * Each event maps to a specific Discord channel target:
 * - match.* → match_results_channel (if enabled)
 * - tournament.* → tournament_announcements_channel (if set)
 */
export type NotificationEvent =
  | "match.ready"
  | "match.result"
  | "tournament.registration_open"
  | "tournament.started"
  | "tournament.round"
  | "tournament.champion";

/**
 * Raw JSON payload the engine POSTs to the worker dispatch endpoint.
 *
 * Fields are flat — the engine resolves `participant_guild_ids` before sending
 * so the worker never hits the DB.
 */
export interface NotifyPayload {
  readonly event: NotificationEvent;
  readonly game: string;
  readonly match_id?: string | undefined;
  readonly tournament_id?: string | undefined;
  readonly host_guild_id: string;
  readonly public_uuid?: string | undefined;
  readonly participant_guild_ids: readonly string[];
}

/**
 * Notification settings shape the worker receives from the engine RPC.
 * Matches proto GuildNotificationSettings fields used for routing.
 */
export interface NotificationSettings {
  readonly guildId: string;
  readonly game: string;
  readonly matchResultsChannel: string;
  readonly tournamentAnnouncementsChannel: string;
  readonly crossGuildAnnouncementsEnabled: boolean;
  readonly announceMatchReadyEnabled: boolean;
  readonly announceMatchResultsEnabled: boolean;
}

/**
 * Resolved target: a guild + channel pair ready for posting.
 */
export interface NotifyTarget {
  readonly guildId: string;
  readonly channelId: string;
}
