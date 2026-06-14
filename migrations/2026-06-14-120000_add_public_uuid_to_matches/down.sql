DROP INDEX IF EXISTS matches_public_uuid_unique;
ALTER TABLE matches DROP COLUMN public_uuid;
