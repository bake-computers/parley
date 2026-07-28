ALTER TABLE match_participants
    ADD COLUMN IF NOT EXISTS assists integer;
