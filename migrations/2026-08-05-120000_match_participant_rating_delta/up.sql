ALTER TABLE match_participants
    ADD COLUMN IF NOT EXISTS rating_delta double precision;
