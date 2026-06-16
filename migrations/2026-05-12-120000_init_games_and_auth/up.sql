-- Baseline migration: the `games` enum that drives all later multi-game
-- discriminator columns, plus the four better-auth tables (kept verbatim
-- so the Node/better-auth client stays compatible).

-- --------------------------------------------------------------------------
-- games enum — extensible; adding a game later is a pure ALTER TYPE migration.
-- Idempotent so a stale or wiped bun_migrations table can re-run safely.
-- --------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE games AS ENUM ('r6', 'cs2');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- better-auth: user
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "user" (
    id                text        PRIMARY KEY,
    name              text        NOT NULL,
    email             text        NOT NULL,
    email_verified    boolean     NOT NULL,
    image             text,
    username          text,
    display_username  text,
    role              text,
    banned            boolean,
    ban_reason        text,
    ban_expires       timestamptz,
    created_at        timestamptz NOT NULL,
    updated_at        timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique    ON "user"(email);
CREATE UNIQUE INDEX IF NOT EXISTS user_username_unique ON "user"(username);

-- --------------------------------------------------------------------------
-- better-auth: session
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "session" (
    id         text        PRIMARY KEY,
    expires_at timestamptz NOT NULL,
    token      text        NOT NULL,
    ip_address text,
    user_agent text,
    user_id    text        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS session_token_unique ON "session"(token);
CREATE INDEX        IF NOT EXISTS session_user_id_idx  ON "session"(user_id);

-- --------------------------------------------------------------------------
-- better-auth: account
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "account" (
    id                        text        PRIMARY KEY,
    account_id                text        NOT NULL,
    provider_id               text        NOT NULL,
    user_id                   text        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    access_token              text,
    refresh_token             text,
    id_token                  text,
    access_token_expires_at   timestamptz,
    refresh_token_expires_at  timestamptz,
    scope                     text,
    password                  text,
    created_at                timestamptz NOT NULL,
    updated_at                timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS account_provider_account_unique
    ON "account"(provider_id, account_id);
CREATE INDEX        IF NOT EXISTS account_user_id_idx
    ON "account"(user_id);

-- --------------------------------------------------------------------------
-- better-auth: verification
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "verification" (
    id         text        PRIMARY KEY,
    identifier text        NOT NULL,
    value      text        NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz,
    updated_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS verification_identifier_value_unique
    ON "verification"(identifier, value);
