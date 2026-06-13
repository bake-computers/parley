ALTER TABLE user_settings
    ADD COLUMN terms_accepted_at_ms bigint  NOT NULL DEFAULT 0,
    ADD COLUMN profile_public        boolean NOT NULL DEFAULT true,
    ADD COLUMN timezone              text    NOT NULL DEFAULT 'UTC';
