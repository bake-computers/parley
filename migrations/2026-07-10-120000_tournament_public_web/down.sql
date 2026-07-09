DROP INDEX IF EXISTS tournaments_public_code_unique;
ALTER TABLE tournaments DROP COLUMN IF EXISTS min_teams;
ALTER TABLE tournaments DROP COLUMN IF EXISTS start_mode;
ALTER TABLE tournaments DROP COLUMN IF EXISTS scheduled_start_at;
ALTER TABLE tournaments DROP COLUMN IF EXISTS registration_closes_at;
ALTER TABLE tournaments DROP COLUMN IF EXISTS prize_text;
ALTER TABLE tournaments DROP COLUMN IF EXISTS rules_text;
ALTER TABLE tournaments DROP COLUMN IF EXISTS description;
ALTER TABLE tournaments DROP COLUMN IF EXISTS public_code;
