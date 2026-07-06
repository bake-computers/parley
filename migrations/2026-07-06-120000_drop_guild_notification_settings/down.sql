CREATE TABLE IF NOT EXISTS guild_notification_settings (
    guild_id                           text    NOT NULL,
    game                               games   NOT NULL DEFAULT 'r6',
    match_results_channel              text,
    tournament_announcements_channel   text,
    leaderboard_updates_enabled        boolean NOT NULL DEFAULT false,
    updated_at                         bigint  NOT NULL,
    cross_guild_announcements_enabled  boolean NOT NULL DEFAULT false,
    announce_match_ready_enabled       boolean NOT NULL DEFAULT true,
    announce_match_results_enabled     boolean NOT NULL DEFAULT true,
    PRIMARY KEY (guild_id, game)
);