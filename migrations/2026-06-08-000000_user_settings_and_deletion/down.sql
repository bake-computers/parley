DROP TABLE IF EXISTS account_deletion_cooldowns;
ALTER TABLE guild_settings DROP COLUMN IF EXISTS default_language;
DROP TABLE IF EXISTS user_settings;
DROP TYPE IF EXISTS languages;