ALTER TABLE guild_memberships
    ADD COLUMN IF NOT EXISTS rating_deviation double precision NOT NULL DEFAULT 350.0;