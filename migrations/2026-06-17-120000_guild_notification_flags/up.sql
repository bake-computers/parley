ALTER TABLE guild_notification_settings
    ADD COLUMN cross_guild_announcements_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN announce_match_ready_enabled      boolean NOT NULL DEFAULT true,
    ADD COLUMN announce_match_results_enabled    boolean NOT NULL DEFAULT true;
