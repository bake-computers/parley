-- Drop the four better-auth tables. The Rust engine-service does not
-- manage authentication — that is handled by the Cloudflare Worker
-- (TypeScript better-auth) which accesses the database directly.
-- These tables are no longer referenced by the Diesel schema.

DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS "user";
