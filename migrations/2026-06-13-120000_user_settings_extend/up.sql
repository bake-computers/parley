ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS terms_accepted_at_ms bigint  NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS profile_public        boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS timezone              text    NOT NULL DEFAULT 'UTC';
