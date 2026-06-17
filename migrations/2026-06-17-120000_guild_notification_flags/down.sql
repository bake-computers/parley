ALTER TABLE guild_notification_settings
    DROP COLUMN IF EXISTS cross_guild_announcements_enabled,
    DROP COLUMN IF EXISTS announce_match_ready_enabled,
    DROP COLUMN IF EXISTS announce_match_results_enabled;
