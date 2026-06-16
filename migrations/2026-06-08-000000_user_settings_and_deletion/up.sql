-- User language preferences, guild default language, and GDPR deletion cooldowns.

DO $$ BEGIN
    CREATE TYPE languages AS ENUM ('en', 'de');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_settings (
    discord_user_id  text       PRIMARY KEY,
    language         languages  NOT NULL DEFAULT 'en',
    created_at       bigint     NOT NULL,
    updated_at       bigint     NOT NULL
);

ALTER TABLE guild_settings
    ADD COLUMN IF NOT EXISTS default_language languages NOT NULL DEFAULT 'en';

CREATE TABLE IF NOT EXISTS account_deletion_cooldowns (
    discord_user_id_hash  text   PRIMARY KEY,
    deleted_at            bigint NOT NULL,
    cooldown_until        bigint NOT NULL
);
