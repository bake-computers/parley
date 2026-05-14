# Database — Diesel schema (multi-game)

Parley's database of record is Postgres, and the canonical schema lives
in `/migrations` (Diesel SQL migrations) with Rust bindings in
`/src/db/schema.rs`. The legacy Drizzle schema at `/packages/db/src/schema.ts`
is **frozen** and will be removed in a follow-up cleanup.

## Game discriminator

Every game-scoped table carries a `game games NOT NULL DEFAULT 'r6'` column,
where `games` is a Postgres enum declared in
`migrations/2026-05-12-120000_init_games_and_auth/up.sql`:

```sql
CREATE TYPE games AS ENUM ('r6', 'cs2');
```

Adding a new game is a pure migration: `ALTER TYPE games ADD VALUE 'new_game';`.
Every existing composite-unique index already includes `game`, so the new
value becomes usable immediately.

**Auth tables are game-agnostic** (per the better-auth convention) and do
not carry the `game` column: `user`, `session`, `account`, `verification`.

## Migrations

| Migration                                      | What it adds                                                    |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `2026-05-12-120000_init_games_and_auth`        | `games` enum + better-auth tables (`user`, `session`, `account`, `verification`) |
| `2026-05-12-120500_players_and_stats`          | `players`, `discord_identities`, `player_stat_snapshots`, `external_match_history` |
| `2026-05-12-121000_guilds_and_matches`         | Guild memberships, quotas, settings, matchmaking rules, notifications, tournament schedules, matches + participants, matchmaking queues + participants |
| `2026-05-12-121500_tournaments`                | Tournaments, tournament teams, rosters, bracket matches         |

Apply locally:

```sh
diesel setup --database-url postgres://localhost/parley_dev
diesel migration run
```

Or let the service apply them at boot by setting `RUN_MIGRATIONS=1`.

## Rename map (Drizzle → Diesel)

Tables were renamed for consistency. The columns are 1-to-1 with the
`main`-branch Drizzle schema.

| Drizzle (`main`)              | Diesel                             |
| ----------------------------- | ---------------------------------- |
| `stat_snapshots`              | `player_stat_snapshots`            |
| `discord_accounts`            | `discord_identities`               |
| `guild_players`               | `guild_memberships`                |
| `guild_limits`                | `guild_match_quotas`               |
| `auto_tournament_schedules`   | `tournament_schedules`             |
| `guild_match_rules`           | `guild_matchmaking_rules`          |
| `custom_matches`              | `matches`                          |
| `custom_match_players`        | `match_participants`               |
| `matchmaking_queue_players`   | `matchmaking_queue_participants`   |
| `tournament_entries`          | `tournament_teams`                 |
| `tournament_entry_players`    | `tournament_team_rosters`          |
| `tournament_bracket_matches`  | `bracket_matches`                  |

Unchanged names: `players`, `guild_settings`, `guild_notification_settings`,
`matchmaking_queues`, `tournaments`, `user`, `session`, `account`,
`verification`.

## New tables

| Table                     | Purpose                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `external_match_history`  | Third-party match history rows (e.g. CS2 GC recent games). Unique on `(game, player_id, external_match_id)`, indexed on `(game, player_id, played_at DESC)`. Game-specific payload lives in the `metadata` JSONB column. |

## Unique-index rescoping

Every unique on a game-scoped table is rescoped by `game`. The important ones:

| Table                   | Unique key(s)                                            |
| ----------------------- | -------------------------------------------------------- |
| `players`               | `(game, profile_id)` where `profile_id IS NOT NULL`; `(game, username_normalized, platform)` |
| `discord_identities`    | `(game, discord_user_id)`; `(game, player_id)`           |
| `guild_memberships`     | `(game, guild_id, discord_user_id)`; `(game, guild_id, player_id)` |
| `guild_match_quotas`    | `(game, guild_id)`                                       |
| `guild_settings`        | compound PK `(guild_id, game)`                           |
| `tournament_teams`      | `(game, tournament_id, captain_discord_user_id)`; `(game, tournament_id, team_name_normalized)` |

## Performance indexes

Non-unique indexes tuned for the hot paths:

* `guild_memberships (game, guild_id, internal_elo DESC)` — per-guild, per-game leaderboards.
* `player_stat_snapshots (game, player_id, fetched_at DESC)` — stats cache "latest fresh snapshot" lookup.
* `external_match_history (game, player_id, played_at DESC)` — CS2 recent-games feed.
* `matches (game, guild_id, status)` and `(game, guild_id, created_at)`.
* `matchmaking_queues (game, guild_id, status)`.

## Timestamps

* Domain tables use `bigint` epoch millisecond timestamps (application-set
  via `chrono::Utc::now().timestamp_millis()`), matching the
  `main`-branch Drizzle convention.
* Better-auth tables use `timestamptz` (also matching `main`), because the
  better-auth JS library expects it.

## Connection pool (runtime)

* `diesel-async = 0.5` + `bb8` Postgres pool; fully non-blocking.
* Config via env: `DATABASE_URL`, `DB_POOL_MAX`, `DB_POOL_MIN_IDLE`,
  `DB_CONNECTION_TIMEOUT_MS`, `DB_IDLE_TIMEOUT_S`.
* `/ready` HTTP endpoint pings the pool (`SELECT 1`) so a downed DB flips
  readiness within one failed checkout.
* `/metrics` exposes per-RPC latency histograms and pool-state gauges
  (Prometheus).

## Stats cache

`StatsCacheStore` (see `src/db/stats_cache_store.rs`) is the Postgres-backed
implementation. On `FetchStats(game, username, platform, season)`:

1. `PlayerRepo::upsert_by_identity` → `player_id`.
2. Read the freshest `player_stat_snapshots` row for `(game, player_id)`
   within the per-game TTL (`STATS_TTL_R6_MS`, `STATS_TTL_CS2_MS`).
3. On miss, single-flight coalesce into the backend registry; write a new
   snapshot; return.
4. If the backend fails with `GcUnavailable`, serve a stale snapshot within
   `STATS_STALE_GRACE_MS` (default 24h) with `degraded=true`.

See `src/db/schema.rs` for the authoritative Diesel schema.
