DO $$ BEGIN CREATE TYPE languages AS ENUM ('en', 'de'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS language languages NOT NULL DEFAULT 'en';
ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS default_language languages NOT NULL DEFAULT 'en';
