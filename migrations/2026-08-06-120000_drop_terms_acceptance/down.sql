ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS terms_accepted_at_ms bigint NOT NULL DEFAULT 0;
