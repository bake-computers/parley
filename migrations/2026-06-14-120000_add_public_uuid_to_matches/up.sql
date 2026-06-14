ALTER TABLE matches ADD COLUMN public_uuid UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX matches_public_uuid_unique ON matches (public_uuid);
