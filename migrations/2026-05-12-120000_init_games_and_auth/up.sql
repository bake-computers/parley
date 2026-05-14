-- Baseline migration: the `games` enum that drives all later multi-game
-- discriminator columns, plus the four better-auth tables (kept verbatim
-- so the Node/better-auth client stays compatible).

-- --------------------------------------------------------------------------
-- games enum — extensible; adding a game later is a pure ALTER TYPE migration.
-- --------------------------------------------------------------------------
CREATE TYPE games AS ENUM ('r6', 'cs2');

-- --------------------------------------------------------------------------
-- better-auth: user
-- --------------------------------------------------------------------------
CREATE TABLE "user" (
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
CREATE UNIQUE INDEX user_email_unique    ON "user"(email);
CREATE UNIQUE INDEX user_username_unique ON "user"(username);

-- --------------------------------------------------------------------------
-- better-auth: session
-- --------------------------------------------------------------------------
CREATE TABLE "session" (
    id         text        PRIMARY KEY,
    expires_at timestamptz NOT NULL,
    token      text        NOT NULL,
    ip_address text,
    user_agent text,
    user_id    text        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX session_token_unique ON "session"(token);
CREATE INDEX        session_user_id_idx  ON "session"(user_id);

-- --------------------------------------------------------------------------
-- better-auth: account
-- --------------------------------------------------------------------------
CREATE TABLE "account" (
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
CREATE UNIQUE INDEX account_provider_account_unique
    ON "account"(provider_id, account_id);
CREATE INDEX        account_user_id_idx
    ON "account"(user_id);

-- --------------------------------------------------------------------------
-- better-auth: verification
-- --------------------------------------------------------------------------
CREATE TABLE "verification" (
    id         text        PRIMARY KEY,
    identifier text        NOT NULL,
    value      text        NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz,
    updated_at timestamptz
);
CREATE UNIQUE INDEX verification_identifier_value_unique
    ON "verification"(identifier, value);
