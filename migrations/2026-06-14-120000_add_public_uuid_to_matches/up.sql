ALTER TABLE matches ADD COLUMN IF NOT EXISTS public_uuid UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS matches_public_uuid_unique ON matches (public_uuid);
