ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS public_code text;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS rules_text text NOT NULL DEFAULT '';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_text text NOT NULL DEFAULT '';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_closes_at bigint;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS scheduled_start_at bigint;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS start_mode text NOT NULL DEFAULT 'manual';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS min_teams integer NOT NULL DEFAULT 2;
CREATE UNIQUE INDEX IF NOT EXISTS tournaments_public_code_unique ON tournaments (public_code) WHERE public_code IS NOT NULL;
