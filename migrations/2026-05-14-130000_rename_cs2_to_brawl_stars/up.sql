-- R6-only chain: rename the `cs2` label to `brawl_stars` so the next migration
-- can drop it cleanly. Guarded by label existence so a replay is a no-op.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'games' AND e.enumlabel = 'cs2'
    ) THEN
        ALTER TYPE games RENAME VALUE 'cs2' TO 'brawl_stars';
    END IF;
END $$;
