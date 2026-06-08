-- User language preferences, guild default language, and GDPR deletion cooldowns.

CREATE TYPE languages AS ENUM ('en', 'de');

CREATE TABLE user_settings (
    discord_user_id  text       PRIMARY KEY,
    language         languages  NOT NULL DEFAULT 'en',
    created_at       bigint     NOT NULL,
    updated_at       bigint     NOT NULL
);

ALTER TABLE guild_settings
    ADD COLUMN default_language languages NOT NULL DEFAULT 'en';

CREATE TABLE account_deletion_cooldowns (
    discord_user_id_hash  text   PRIMARY KEY,
    deleted_at            bigint NOT NULL,
    cooldown_until        bigint NOT NULL
);