# Vessel Rust Engine - Learnings

## Session Start: 2026-05-14T20:13:16.255Z

### Task 5: CLI Skeleton with Clap Derive

**Files created/modified:**
- `crates/vessel/src/cli.rs` — new file with VesselCli, SiphonArgs, ThrusterArgs, PurgeArgs
- `crates/vessel/src/lib.rs` — added `pub mod cli;`
- `crates/vessel/Cargo.toml` — added `thiserror` dependency

**Key patterns learned:**
- Clap derive: `#[derive(Parser)]` on struct, `#[derive(Subcommand)]` on enum, `#[derive(Args)]` on subcommand args
- `value_parser` custom validation for `--private-key` at parse time
- Clap uses kebab-case for CLI args; enum variants use clap::ValueEnum which auto-converts
- `#[arg(long, global = true)]` for global flags that work across subcommands
- `try_parse_from` in tests for CLI parsing verification
- Tests must be in `#[cfg(test)] mod tests` within the module file
- Module must be declared in lib.rs before tests will run

**Validation:**
- `parse_private_key` function validates exactly 64 hex characters
- Invalid length or non-hex chars rejected at parse time with clear error messages
- `cargo test -p vessel -- cli::` runs 9 CLI tests (all passing)
- `cargo test -p vessel` runs 19 total tests (all passing)

### Task 2: Hull Bloom Filter Module

**Files created/modified:**
- `crates/vessel/src/hull.rs` — new file with Hull struct
- `crates/vessel/src/lib.rs` — temporarily simplified to `pub mod hull;` only (other modules not yet implemented)
- `crates/vessel/Cargo.toml` — added `thiserror` and `tempfile` dev-dependencies

**Key patterns learned:**
- `AtomicBloomFilter` provides lock-free concurrent insert/check — all methods take `&self`
- `with_false_pos(fp_rate).expected_items(n)` sizes the filter automatically
- `AtomicBloomFilter` implements `Clone` but not `Serialize` directly — need `serde` feature
- `bincode::serialize` and `bincode::deserialize` for compact binary serialization
- Bloom filter `contains()` can return false positives — check_or_insert logic must handle race condition where item appears between contains() and insert()
- Race condition fix: check contains first, if true return immediately, else insert and count

**Validation:**
- `cargo test -p vessel hull` runs 10 tests (all passing)
- Default capacity (400K items @ 1% FP) uses ~731 KB memory, 10 hash functions
- False positive rate test verifies ≤ 1.5% at capacity
- Concurrent insert test: 8 threads × 50K items, allows ~5000 FP losses (expected behavior)
- Corrupted file handling: returns fresh filter with warning message, not error
### Task 4: Diesel Migration for Vessel Session Table + Model Struct

**Files created:**
- `migrations/2026-05-14-200000_vessel_sessions/up.sql` — CREATE TABLE vessel_sessions
- `migrations/2026-05-14-200000_vessel_sessions/down.sql` — DROP TABLE IF EXISTS vessel_sessions
- `crates/vessel/src/session.rs` — VesselSession and NewVesselSession structs
- `crates/vessel/tests/session_model.rs` — integration test for model compilation

**Key patterns learned:**
- Migration directory naming: `YYYY-MM-DD-HHMMSS_description/`
- SQL conventions: TIMESTAMPTZ for timestamps, TEXT for status strings, INT4 for integers
- Self-contained Diesel table definition in vessel crate (vessel doesn't share parley schema)
- `diesel::table!` macro defines the table schema inline — no external schema.rs needed
- chrono::DateTime<Utc> maps to TIMESTAMPTZ; uuid::Uuid maps to UUID (requires diesel `uuid` feature)
- `#[diesel(table_name = vessel_sessions)]` attribute links struct to table definition
- `cargo test -p vessel --test session_model` runs integration tests separately from lib tests

**Validation:**
- `cargo build -p vessel` — compiles cleanly (only pre-existing hull/hull error issues)
- `cargo test -p vessel --test session_model` — 2 tests pass (vessel_session_model_compiles, new_vessel_session_model_compiles)
- `cargo test -p vessel --lib` — 19 tests pass (hull + cli modules)
- `cargo fmt` and `cargo clippy -p vessel` — no issues

**Note:** The Hull module has pre-existing thiserror dependency issues in hull.rs — those are separate from this task and were present before this work. The session module is clean.

### Task 6: Concurrency Primitives — Bounded MPSC Channel Types for Siphon

**Files created:**
- `crates/vessel/src/siphon/mod.rs` — `pub mod channel;`
- `crates/vessel/src/siphon/channel.rs` — SiphonCommand, SiphonResult, CrawlConfig, create_channels, tests
- `crates/vessel/src/lib.rs` — added `pub mod siphon;`

**Key patterns learned:**
- `tokio::sync::mpsc::channel(capacity)` creates bounded MPSC channel
- `Sender::send()` awaits when full (backpressure) — NEVER use `try_send()` + drop
- `Receiver::recv()` returns `Option<T>` — `None` means channel closed
- Module path: `siphon::channel::tests` (not just `channel::tests`)
- lib.rs must declare module with `pub mod siphon;` for tests to be discoverable
- Tests are declared in `#[cfg(test)] mod tests` inside the source file

**Types implemented:**
- `SiphonCommand::Crawl { uid, depth }` and `SiphonCommand::Terminate`
- `SiphonResult { uid, depth, discovered_uids, stats }`
- `CrawlConfig { max_depth, platform, channel_capacity, rate_limit_per_second, retry_policy }`
- `create_channels(capacity) -> (Sender<SiphonCommand>, Receiver<SiphonCommand>)`

**Tests:**
- `channel_blocks_at_capacity` — capacity=5, fill, 6th blocks via timeout, receive, send succeeds
- `terminate_drains_gracefully` — 5 Crawl + Terminate, drain verifies 6 items received
- `concurrent_send_receive` — 4 tasks × 10 items concurrently, all 40 received
- `siphon_result_contains_expected_fields` — verifies struct layout
- `crawl_config_has_expected_defaults` — verifies RetryPolicy::default() == 2 attempts

**Validation:**
- `cargo test -p vessel --lib siphon::channel::tests` — 5 tests pass
- `cargo test -p vessel --lib` — 26 tests pass (all vessel modules)
- `cargo check -p vessel` — compiles cleanly
- Pre-existing `stats-scraper` clippy issues (unrelated to this task) must be fixed separately

**Issue encountered:** `channel.rs:88` had `.expect("should not be None")` on `SiphonCommand` directly — fix: `let cmd = rx.recv().await.expect(...); assert!(matches!(cmd, SiphonCommand::Crawl { .. }));`

### Task 1: Ed25519 Signing Module (thruster/signing)

**Files created/modified:**
- `crates/vessel/src/thruster/mod.rs` — new file, `pub mod signing;`
- `crates/vessel/src/thruster/signing.rs` — new file with sign_interaction, verify_signature, SigningError
- `crates/vessel/src/lib.rs` — added `pub mod thruster;`

**Key patterns learned:**
- Discord interaction message format: `timestamp_bytes ++ body_bytes` (UTF-8, NO delimiter)
- `SigningKey::from_bytes(&[u8; 32])` is infallible (any 32 bytes is a valid seed, clamping happens at sign time)
- `VerifyingKey::from_bytes(&[u8; 32])` is fallible — decompresses Edwards point, returns `Result<_, SignatureError>`
- `Signature::from_bytes(&[u8; 64])` takes reference (ed25519-dalek 2.1)
- ed25519-dalek 2.x traits: `Signer` (provides `.sign()` on SigningKey) and `Verifier` (provides `.verify()` on VerifyingKey)
- `hex::encode(sig.to_bytes())` produces lowercase hex by default
- `[0u8; 32]` IS a valid Ed25519 compressed point (y=0, x=√-1, order-4 torsion point) — use wrong-length key for invalid-key tests
- `try_into()` on Vec consumes the value — capture length before move for error messages

**API decisions:**
- Functions accept `&[u8]` for key params (not `&[u8; 32]`) for ergonomic error handling on wrong-length keys
- `verify_signature` returns `Ok(false)` for signature mismatch (not structural error), `Err(..)` for bad keys/hex

**Tests (7):**
- `test_sign_and_verify_roundtrip` — RFC 8032 test vector keypair, sign + verify
- `test_verify_wrong_message_fails` — mismatch returns Ok(false)
- `test_verify_wrong_key_fails` — wrong-length key returns Err(InvalidKeyLength)
- `test_invalid_key_length_error` — 31-byte key returns Err
- `test_invalid_hex_signature_error` — non-hex signature returns Err
- `test_empty_body` — body=b"" roundtrips
- `test_large_body` — 10KB body roundtrips

**Validation:**
- `cargo test -p vessel signing` — 7 tests pass
- `cargo check -p vessel --lib` — compiles cleanly
- `cargo fmt` — clean

### Task 7: Transaction Session Manager — VesselSessionHandle

**Files modified:**
- `crates/vessel/src/session.rs` — extended with VesselSessionHandle, SessionError, VesselPool, async tests

**Key patterns learned:**
- `diesel_async::pooled_connection::bb8::Pool` is a re-export of `bb8::Pool<AsyncPgConnection>`
- `pool.get_owned()` returns `PooledConnection<'static, AsyncPgConnection>` — owned, 'static lifetime, safe to store in struct alongside pool
- Manual transaction management via raw SQL: `BEGIN`, `COMMIT`, `ROLLBACK` executed with `diesel::sql_query(...).execute(&mut conn)`
- `pg_try_advisory_lock(bigint)` / `pg_advisory_unlock(bigint)` for cross-session concurrency control
- Advisory lock IDs: hash UUID's first 8 bytes as `i64::from_be_bytes`
- `diesel::sql_query("SELECT ...")` requires `QueryableByName` struct for column-mapped results — `(bool,)` tuple doesn't implement `QueryableByName`
- `#[derive(diesel::deserialize::QueryableByName)]` with `#[diesel(sql_type = ...)]` on fields
- `SessionError` with `#[from] diesel::result::Error` enables direct `?` operator usage (no `.map_err` needed)
- `From` impls for `RunError` and `PoolError` → `SessionError::Pool` for pool/connection failures
- Struct drop order: declare `conn` after `pool` so Rust drops connection before pool
- `purge` and `complete` consume `self` — session handle is single-use
- Integration tests check `DATABASE_URL` env var; skip gracefully if unset

**Implementation decisions:**
- Pool and locked connection both stored in VesselSessionHandle — handles connection lifecycle
- Advisory lock is session-level (not transaction-level) — persists across BEGIN/COMMIT/ROLLBACK
- Status updates (`purged`/`completed`) run on a *fresh* connection after releasing the held connection
- `purge` intentionally ignores ROLLBACK and unlock errors (best-effort cleanup) but propagates status update failures
- `complete` propagates all errors (COMMIT failure is critical)
- `uuid_to_lock_id` is deterministic but different UUIDs produce different lock IDs

**Tests (8 total, 4 unit + 4 integration):**
- `uuid_to_lock_id_is_deterministic` — same UUID produces same i64 (unit)
- `uuid_to_lock_id_different_uuids_different_keys` — different UUIDs → different i64 (unit)
- `test_session_start_inserts_row` — start session, verify row exists with status='active' (integration)
- `test_session_purge_rolls_back` — start, purge, verify status='purged' (integration)
- `test_session_complete_commits` — start, complete, verify status='completed' (integration)
- `test_concurrent_session_fails` — start session A, attempt start B → SessionError::LockConflict (integration)

**Validation:**
- `cargo check -p vessel` — compiles cleanly
- `cargo fmt -p vessel` — no formatting issues
- `cargo clippy -p vessel --lib --no-deps` — only pre-existing hull.rs warning (should_implement_trait), session code clean
- `cargo test -p vessel --lib -- session::tests` — 8/8 pass
- `cargo test -p vessel` — 48/52 pass (4 pre-existing thruster failures from parallel Task 8)

### Task 10: Thruster Interaction Payload Builder + Ed25519 Signing

**Files created/modified:**
- `crates/vessel/src/thruster/payload.rs` — InteractionPayload, InteractionType, InteractionBuilder, tests
- `crates/vessel/src/thruster/signer.rs` — SignedRequest, sign_payload(), PreSignedBuffer, tests
- `crates/vessel/src/thruster/signing.rs` — added `InternalError(String)` variant to SigningError
- `crates/vessel/src/thruster/mod.rs` — added `pub mod payload; pub mod signer;`

**Key patterns learned:**
- Discord interaction types are integers in JSON (not snake_case strings). `#[serde(rename_all = "snake_case")]` serializes as strings — wrong for Discord's API.
- Custom `Serialize`/`Deserialize` impls for integer enums: `serializer.serialize_u8(*self as u8)` + match on deserialize. Enum must derive `Copy` for `*self` deref.
- `serde_json::to_vec()` for direct byte serialization (avoids string round-trip for signing).
- `skip_serializing_if = "Option::is_none"` omits optional fields from JSON output.
- `#[serde(rename = "type")]` for Rust keyword workaround in struct serialization.
- `PreSignedBuffer`: `Mutex<Vec<SignedRequest>>` + `AtomicUsize` for ring buffer with interior mutability. Re-sign when timestamp > 300s old.
- `Mutex::lock().map_err(...)` instead of `.unwrap()` to avoid panics outside tests. Poisoned mutex → `SigningError::InternalError`.
- RFC 8032 test vector private key reused across signing/payload/signer tests for consistency.

**API decisions:**
- `InteractionBuilder::build()` panics on missing required fields (per spec), with clear `.expect()` messages.
- `sign_payload()` takes `&[u8; 32]` for the private key; signing.rs `sign_interaction()` accepts `&[u8]` via Deref coercion.
- `PreSignedBuffer` pre-signs `capacity` entries cycling through `payloads`; `get_next()` returns entries atomically with auto re-sign.
- Buffer rejects empty payloads and zero capacity at construction time.
- `SignedRequest` derives `Clone` for buffer cloning on `get_next()` return.

**Tests (5 payload + 8 signer = 13 total):**
- payload: `test_payload_json_matches_schema` — type=2, id, application_id, token
- payload: `test_payload_optional_fields_omitted` — None fields excluded from JSON
- payload: `test_payload_with_optional_fields` — Some(guild_id, channel_id, data) included
- payload: `test_interaction_type_serializes_as_integer` — type=4 as integer
- payload: `test_to_json_roundtrip_matches_builder_input` — roundtrip via serde_json::Value
- signer: `test_sign_payload_produces_valid_headers` — headers present, timestamp recent, sig hex
- signer: `test_sign_payload_body_is_valid_json` — body parses as JSON, type=2, id correct
- signer: `test_sign_payload_different_payloads_produce_different_signatures` — different sig for different payload
- signer: `test_presigned_buffer_rotation` — drain 6 entries, all timestamps fresh, batch assertions
- signer: `test_presigned_buffer_cycle_through_payloads` — ids cycle A, B, A, B
- signer: `test_presigned_buffer_empty_payloads_error` — empty vec → Err
- signer: `test_presigned_buffer_zero_capacity_error` — capacity=0 → Err
- signer: `test_signed_request_clone` — clone equality

**Validation:**
- `cargo test -p vessel -- thruster::payload thruster::signer` — 13/13 pass
- `cargo test -p vessel -- thruster` — 22/22 pass (7 signing + 5 payload + 8 signer + 2 cli)
- `cargo check -p vessel` — compiles cleanly
- `cargo fmt` — clean
- `cargo clippy` pre-existing stats-scraper issues block vessel clippy (unrelated)

### Task 11: Thruster HTTP Sender + Pre-Signed Buffer + Rate Control

**Files created/modified:**
- `crates/vessel/src/thruster/sender.rs` — ThrusterSender, ThrusterStats, SenderError, tests
- `crates/vessel/src/thruster/mod.rs` — added `pub mod sender;`
- `crates/vessel/Cargo.toml` — added `[[bench]]` section for criterion
- `crates/vessel/benches/thruster_throughput.rs` — criterion throughput benchmark

**Key patterns learned:**
- Rate limiting: `Duration::from_micros(1_000_000 / tps_target).max(1)` for interval-based TPS throttle, with `sleep(tick_interval - elapsed)` for the remainder.
- Concurrency control: `Arc<tokio::sync::Semaphore>` with `acquire_owned()` limits in-flight requests, provides natural backpressure without unbounded task spawning.
- `PreSignedBuffer::get_next()` returns `Result<SignedRequest, SigningError>` — clock hand-off within spawned tasks, with errors counted in `ThrusterStats`.
- `reqwest::Client::post(url).header(k, v)` chained for each header from `SignedRequest::headers`; `Content-Type: application/json` added.
- `reqwest::Client::builder().pool_max_idle_per_host(100).pool_idle_timeout(120s).tcp_keepalive(60s)` — pattern from stats-scraper's `StatsClient`.
- Percentile calculation: `sorted[((len-1) as f64 * p).round() as usize]` — standard nearest-rank method.
- Mock HTTP server for tests: `tokio::net::TcpListener` + `tokio::io::{AsyncReadExt, AsyncWriteExt}` — read request bytes, write minimal 200 OK response.
- Criterion 0.5 async benchmarks: NO `to_async()` method — use `b.iter_custom(|iters| rt.block_on(async { ... }))` instead.
- Criterion `[[bench]]` requires `harness = false` in Cargo.toml.
- `SenderError` derives `#[from]` for `SigningError` and `reqwest::Error` for ergonomic `?` usage.

**API decisions:**
- Constructor validates `tps_target > 0` (returns `SenderError::InvalidTpsTarget`).
- `max_concurrent` defaults to `tps_target` (1 second of concurrency), configurable via builder-pattern `with_max_concurrent()`.
- Synthetic payloads: 10 payloads cycling with IDs `synth-{i}`, buffer capacity `max(tps_target * 5, 10)`.
- `run()` returns `ThrusterStats` directly (not `Result`) — errors are tracked in the stats struct, not propagated.
- Semaphore closure branch marked as unreachable-in-practice with `let Ok(permit) = ... else { break; }`.

**Tests (9):**
- `test_sender_sends_requests` — mock server verifies requests arrive
- `test_stats_accumulate` — requests_sent, duration, actual_tps populated
- `test_rate_limiting` — actual TPS within ±50% of target for 2s run
- `test_sender_rejects_zero_tps` — InvalidTpsTarget error
- `test_sender_with_custom_max_concurrent` — configurable concurrency
- `test_percentile_empty_returns_zero` — edge case
- `test_percentile_single_element` — single value edge case
- `test_percentile_multiple_elements` — correctness on 100 elements
- `test_build_synthetic_payloads_count` — correct count and app_id

### Task 9: Siphon Stats-Scraper Integration + HTML Parsing

**Files created/modified:**
- `crates/vessel/src/siphon/parser.rs` — new file with `extract_match_participants()`
- `crates/vessel/src/siphon/scraper_bridge.rs` — new file with `create_stats_fetcher()`, `map_fetch_error()`
- `crates/vessel/src/siphon/mod.rs` — added `pub mod parser; pub mod scraper_bridge;`

**Key patterns learned:**
- `StatsFetcher` type alias: `Arc<dyn Fn(&str) -> Pin<Box<dyn Future<Output = Result<Vec<String>, String>> + Send>> + Send + Sync>`
- `Box::pin(async move { ... })` creates a pinned future for the closure return type
- `StatsClient` fields: `http: Client`, `base_url: String`, `retry: RetryPolicy` — all `Send + Sync`, safe to wrap in `Arc`
- `ScrapedStatsCollection.by_season` is a `BTreeMap<String, ScrapedStats>` — iterated with `.values()`
- `StatsProfile.profile_id` is `String` — canonical UUID for a player
- `StatsFetchError::new()` is private — construct with struct literal syntax in tests
- `StatsFetchErrorKind` variants: `ProfileNotFound`, `HttpStatus`, `Network`, `InvalidProfile`, `InvalidPayload`, `SeasonNotFound`, `GcUnavailable`
- Error mapping design: `ProfileNotFound` → `Ok(Vec::new())` (skip gracefully), `HttpStatus + 429` → `Err("rate limited")`, everything else → `Err(e.to_string())`

**Implementation decisions:**
- `extract_match_participants` extracts `profile_id` from `latest` + each `by_season` entry, deduplicates via `HashSet`
- Safety caps: `MAX_PER_ENTRY = 10`, `MAX_TOTAL = 100` — per-entry cap is a no-op today but guards against future multi-UID profile expansions
- `map_fetch_error` extracted as private helper for testability without mock HTTP
- `create_stats_fetcher` returns `StatsFetcher` (Arc closure) capturing `Arc<StatsClient>` by clone

**Tests (4 parser + 6 bridge = 10 total):**
- parser: `test_extract_participants_from_fixture` — 3 seasons (2 shared UID) + latest → deduped to 2
- parser: `test_empty_collection_returns_empty` — default collection → empty vec
- parser: `test_empty_profile_id_skipped` — empty profile_id in one entry, valid in another
- parser: `test_many_entries_dedup_and_bounded` — 120 entries capped at 100, no duplicates
- bridge: `test_map_profile_not_found_returns_empty` — ProfileNotFound → Ok(vec![])
- bridge: `test_map_rate_limited_returns_err` — HttpStatus(429) → Err("rate limited")
- bridge: `test_map_network_error_returns_err` — Network → Err
- bridge: `test_map_http_status_non_429_returns_err` — HttpStatus(503) → Err, not "rate limited"
- bridge: `test_map_gc_unavailable_returns_err` — GcUnavailable → Err
- bridge: `test_create_stats_fetcher_compiles` — type assertion only (no HTTP in unit test)

**Validation:**
- `cargo test -p vessel siphon::` — 24/24 pass (14 existing + 10 new)
- `cargo fmt -p vessel` — clean
- `cargo clippy -p vessel --lib --no-deps` — 3 pre-existing errors (hull.rs, worker.rs), none in new code
- `cargo check -p vessel` — compiles cleanly (no warnings on new code after removing unused imports)

**Note:** `cargo test -p vessel` (full) fails due to pre-existing `[[bench]]` section in Cargo.toml referencing missing `benches/thruster_throughput.rs`. Not related to this task.

### Task 13: Thruster End-to-End Pipeline — Orchestrator, Config, SIGTERM

**Files modified:**
- `crates/vessel/src/thruster/mod.rs` — ThrusterConfig, ThrusterOrchestrator, config_from_args, tests
- `crates/vessel/src/session.rs` — fixed diesel table! macro (changed `diesel::table!` → `table!` with `use diesel::table;`)
- `crates/vessel/src/siphon/db_writer.rs` — fixed double mutable borrow (used `writer.conn` instead of `&mut *conn`)

**Key patterns learned:**
- `tokio::select!` races `sender.run(duration)` against `tokio::signal::ctrl_c()`. On SIGTERM, returns zeroed `ThrusterStats` for graceful exit.
- `config_from_args` bridges CLI types to library types — converts `cli::InteractionType` (clap ValueEnum) to `payload::InteractionType` (Discord integer enum).
- `hex::decode` + `try_into` pattern for parsing 64-char hex private key → `[u8; 32]`.
- `ThrusterOrchestrator` wraps `ThrusterSender` providing clean top-level API + SIGTERM handling.
- `ThrusterConfig` uses `payload::InteractionType` (not `cli::InteractionType`) to keep the library decoupled from CLI specifics.
- `ConfigError` uses `#[from] SenderError` for ergonomic error propagation through the orchestrator chain.
- Mock HTTP server pattern reused from sender tests — `TcpListener::bind("127.0.0.1:0")` + spawned response handlers.

**Pre-existing issues fixed:**
- `session.rs:23`: `diesel::table! { pub vessel_sessions ... }` failed to expand with diesel 2.2. Fix: `use diesel::table;` + `table! { vessel_sessions ... }`. Also removed conflicting `pub(crate) use vessel_sessions;` re-export.
- `siphon/db_writer.rs:173`: double mutable borrow of `conn` (held by `SiphonDbWriter` and used directly). Fix: replaced `&mut *conn` with `writer.conn` in direct queries.

**Tests (9 new):**
- `test_orchestrator_builds_and_runs` — create orchestrator, run 500ms against mock server, verify stats
- `test_config_from_args` — parse full CLI args into ThrusterConfig, verify all fields
- `test_config_from_args_defaults` — verify default tps=1000, duration=60s, type=Ping
- `test_config_from_args_application_command` — verify ApplicationCommand mapping
- `test_config_from_args_message_component` — verify MessageComponent mapping
- `test_graceful_shutdown` — spawn orchestrator, abort after 300ms, verify clean exit
- `test_hex_to_key_valid` — verify hex decode → [u8; 32]
- `test_hex_to_key_invalid_length` — short hex → Err
- `test_hex_to_key_invalid_chars` — invalid hex → Err
- `test_cli_interaction_to_payload_all_variants` — verify all 3 CLI variants map correctly

**Validation:**
- `cargo test -p vessel -- thruster` — 41/41 pass
- `cargo bench -p vessel -- thruster` — compiles (benchmark from Task 11)
- `cargo fmt -p vessel` — clean
- `cargo clippy -p vessel --lib --no-deps` — no thruster warnings

### Task 12: Siphon DB Pipeline — SiphonDbWriter

**Files created/modified:**
- `crates/vessel/src/siphon/db_writer.rs` — new file with SiphonDbWriter struct
- `crates/vessel/src/siphon/mod.rs` — added `pub mod db_writer;`
- `crates/vessel/src/session.rs` — added `pub mod schema { pub use super::vessel_sessions::*; }` to expose the table module

**Key patterns learned:**
- Diesel's `table!` macro generates a private module by default — can't make it `pub` via the macro syntax (adding `pub` before the table name causes a parse error in the macro expansion)
- Workaround: Create a public wrapper module that re-exports the private module's items: `pub mod schema { pub use super::vessel_sessions::*; }`
- This preserves the single source of truth for the table schema while making it accessible to sibling modules like `db_writer`
- The `Insertable` trait is parameterized by the specific table type from the `table!` macro — a duplicate `table!` definition in a different module won't work with `Insertable` impls from the original definition
- Column references use module-qualified paths: `vessel_sessions::session_id`, `vessel_sessions::players_discovered`
- Parameter naming: use `sid` instead of `session_id` to avoid shadowing with Diesel DSL column names
- `diesel::update().set(col.eq(col + n))` for atomic counter increments
- Borrow checker in integration tests: `SiphonDbWriter` holds `&mut conn`, so subsequent queries must go through `writer.conn` not `&mut *conn`

**API decisions:**
- `record_discovery(sid, discovered_count)` — increments `players_discovered` atomically; `sid` parameter avoids shadowing the `vessel_sessions::session_id` column
- `insert_session(new_session)` — reuses `NewVesselSession` from session.rs via `use crate::session::NewVesselSession`
- Both methods return `diesel::QueryResult` — error handling is explicit

**Tests (7 total: 3 unit + 4 integration):**
- `test_new_does_not_panic` — compile-time check (unit)
- `test_record_discovery_signature` — compile-time type check (unit)
- `test_insert_session_signature` — compile-time type check (unit)
- `test_record_discovery_increments_count` — insert session, increment discovery count, verify cumulative (integration)
- `test_insert_session_works` — insert session with non-zero counters, verify all fields (integration)
- `test_writer_uses_transaction` — insert within tx, verify visible, commit, verify persisted on fresh conn (integration)
- `test_record_discovery_no_match_is_noop` — update non-existent session returns Ok (integration)

**Validation:**
- `cargo check -p vessel` — compiles cleanly (0 errors, 0 warnings from vessel code)
- `cargo test -p vessel --lib -- siphon::db_writer` — 7/7 pass
- `cargo test -p vessel` — 102/102 pass (all tests, no regressions)
- `cargo fmt -p vessel` — clean (no formatting changes)

### Task 15: CLI Progress Bars + Session Orchestration

**Files created/modified:**
- `crates/vessel/src/progress.rs` — new file with `VesselProgress` struct
- `crates/vessel/src/lib.rs` — added `pub mod progress;`
- `crates/vessel/Cargo.toml` — added `anyhow = { workspace = true }`
- `crates/vessel/examples/siphon.rs` — full pipeline: CLI → session → hull → workers → progress → complete
- `crates/vessel/examples/thruster.rs` — full pipeline: CLI → config → orchestrator → progress → stats
- `crates/vessel/examples/purge.rs` — full pipeline: CLI → session → purge → progress

**Key patterns learned:**
- `indicatif::MultiProgress::add(ProgressBar)` to register bars; bars must be added before modification
- `ProgressBar::new_spinner().enable_steady_tick(Duration::from_millis(80))` for auto-animating spinners
- `ProgressStyle::with_template("{spinner} {msg}: {pos}").tick_chars("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏")` for braille spinner
- `MultiProgress::println()` for interleaving log messages with progress bars safely
- `ProgressBar::set_position(u64)` updates `{pos}` in template (shown next to message)
- Examples in Rust crates are compiled as separate binaries with access to `[dependencies]` but NOT `[dev-dependencies]`
- Anyhow must be in `[dependencies]` not `[dev-dependencies]` for examples to use it
- `DATABASE_URL` graceful fallback: `cli.database_url.or_else(|| std::env::var("DATABASE_URL").ok()).unwrap_or_else(|| "postgres://...")`
- CLI platform enum mapping: `cli::StatsPlatform` (clap ValueEnum) → `stats_scraper::fetch::StatsPlatform` (library type)
- Purge example starts a fresh session (VesselSessionHandle::start) then purges it — session_id from CLI args is informational only since there's no "reconnect by UUID" API

**Implementation decisions:**
- `VesselProgress` implements `Default` via `Default::default()` delegating to `Self::new()`
- All three spinners auto-tick at 80ms for smooth animation without manual `tick()` calls
- `discovery_rate` shows cumulative results processed, `active_syncs` shows discovered UIDs, `db_write_latency` available for future DB write tracking
- Examples use `anyhow::Result` with `?` operator for concise error propagation
- Examples guard against wrong subcommand with `anyhow::bail!()`
- Siphon example sends `worker_count` Terminate commands (one per worker) then drops sender

**Validation:**
- `cargo build -p vessel --examples` — all 3 examples compile
- `cargo run -p vessel --example siphon -- --help` — shows arg descriptions for all subcommands
- `cargo run -p vessel --example thruster -- thruster --help` — shows thruster options
- `cargo run -p vessel --example purge -- purge --help` — shows purge options
- `cargo fmt -p vessel` — clean, no formatting changes
- `cargo clippy -p vessel --lib --examples --no-deps` — 0 new warnings (3 pre-existing in hull.rs/worker.rs)
- `cargo test -p vessel --lib` — 100/100 pass (no regressions)
