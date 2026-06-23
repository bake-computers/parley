ALTER TABLE user_settings DROP COLUMN IF EXISTS language;
ALTER TABLE guild_settings DROP COLUMN IF EXISTS default_language;
DROP TYPE IF EXISTS languages;
