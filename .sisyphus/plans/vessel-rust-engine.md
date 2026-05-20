# Vessel: Rust Data Engine for Ecosystem Mapping & Discord API Emulation

## TL;DR

> **Quick Summary**: Build Vessel as a `crates/vessel/` workspace member — a Rust library + CLI examples implementing four components: Siphon (recursive R6 stats crawler), Hull (Bloom filter dedup shield), Thruster (1K+ TPS sustained Discord Interaction load generator), and Purge (transaction-based rollback). TDD workflow throughout.
>
> **Deliverables**:
> - `crates/vessel/` — complete Rust crate with library API + 3 example binaries (siphon, thruster, purge)
> - Hull module: `fastbloom::AtomicBloomFilter` wrapper with bincode persistence
> - Siphon module: tokio MPSC worker pool with recursive crawl + bloom dedup + Diesel writes
> - Thruster module: Ed25519-signed Discord Interaction payload generator at 1K+ TPS
> - Purge module: Postgres ROLLBACK + bloom file cleanup + advisory lock
> - Full TDD test suite + criterion benchmarks for Thruster throughput
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 3 waves + final verification
> **Critical Path**: Task 1 → Task 4 → Task 7 → Task 12 → Task 15 → F1-F4

---

## Context

### Original Request
Build Vessel, a high-concurrency CLI and crate for Ecosystem Mapping and 1:1 Discord API Emulation. Four components: Siphon (recursive crawler of R6 stats.cc), Hull (Bloom filter dedup shield), Thruster (1K+ TPS sustained Discord Interaction load generator), and Purge (transaction-based environment reset).

### Interview Summary
**Key Discussions**:
- **Workspace layout**: `crates/vessel/` as subdirectory crate (confirmed)
- **CLI shape**: Library crate + examples, not a single binary with subcommands (confirmed)
- **Crawl target**: stats.cc website — HTML scraping, reusing `stats-scraper` crate's `StatsClient` (confirmed)
- **Load profile**: Sustained 1K+ TPS, not burst (confirmed)
- **Game scope**: R6 only for V1, BrawlStars out of scope but extensible via `Game` enum (confirmed)
- **Discord creds**: CLI flags `--app-id` and `--private-key` (confirmed)
- **Purge approach**: Transaction-based rollback (not TRUNCATE). Begin tx at session start, ROLLBACK on purge (confirmed)
- **Workers KV**: Not involved — only DB and local bloom cache (confirmed)
- **Test strategy**: TDD — write failing test first, implement, verify pass (confirmed)

**Research Findings**:
- **stats-scraper**: Has `StatsClient` with retry/backoff, `StatsBackend` trait, `SingleFlight` coalescing, pure parsing layer. Siphon reuses this.
- **Diesel schema**: 20+ tables, `Game` enum (R6/BrawlStars/Cs2), `DbPool = Pool<AsyncPgConnection>` via bb8. Vessel uses same schema.
- **Ed25519 verification**: TypeScript code at `packages/runtime/src/utils/verify.ts` constructs message as `timestamp_bytes + body_bytes`, hex-encodes signature. Rust must produce the same format.
- **fastbloom**: `AtomicBloomFilter` recommended — lock-free, 2-20x faster, serde/bincode serialization. ~731 KB for 400K items @ 1% FP.
- **No existing CLI tools** in project. No transaction infrastructure exists in codebase.

### Metis Review
**Identified Gaps** (all addressed):
- **Transaction infrastructure doesn't exist**: Vessel must build it. Purge uses `ROLLBACK` of session-scoped transaction. (Addressed: Task 4 + Task 7 build this)
- **Thruster's target endpoint**: Sending signed HTTP POST requests to configurable `--target-url`. Not a DB writer. (Addressed: clear in task specs)
- **Bloom filter lifecycle**: Purge deletes bloom cache file. Fresh sessions start with empty or loaded filter. (Addressed: Task 14)
- **Concurrent instance collision**: Use `pg_try_advisory_lock` at startup. (Addressed: Task 14)
- **DB connection pool**: Vessel creates its own pool (separate process from Parley). (Addressed: Task 7)
- **Bounded channels**: Use bounded MPSC with configurable capacity + backpressure. (Addressed: Task 6)

---

## Work Objectives

### Core Objective
Build a production-quality Rust crate (`crates/vessel/`) with four composable components for R6 ecosystem crawling, bloom filter dedup, Discord Interaction load generation, and transactional environment reset — all with TDD verification.

### Concrete Deliverables
- `crates/vessel/src/lib.rs` — public API re-exports
- `crates/vessel/src/hull.rs` — Bloom filter wrapper (AtomicBloomFilter + bincode)
- `crates/vessel/src/siphon/` — Recursive crawl engine (worker pool, queue, stats-scraper integration)
- `crates/vessel/src/thruster/` — Discord Interaction payload builder + Ed25519 signing + HTTP sender
- `crates/vessel/src/purge.rs` — Transaction rollback + bloom cleanup + advisory lock
- `crates/vessel/src/session.rs` — Transaction session manager
- `crates/vessel/src/cli.rs` — clap CLI definitions
- `crates/vessel/src/progress.rs` — indicatif multi-progress bars
- `crates/vessel/examples/siphon.rs` — Siphon example binary
- `crates/vessel/examples/thruster.rs` — Thruster example binary
- `crates/vessel/examples/purge.rs` — Purge example binary
- `crates/vessel/tests/` — Integration tests
- `crates/vessel/benches/` — Criterion benchmarks
- New Diesel migration for Vessel session tables (if needed)

### Definition of Done
- [ ] `cargo build -p vessel` succeeds with zero warnings
- [ ] `cargo test -p vessel` passes all unit + integration tests
- [ ] `cargo clippy -p vessel -- -D warnings` passes
- [ ] `cargo fmt -p vessel --check` passes
- [ ] `cargo bench -p vessel` produces Thruster throughput baseline ≥ 1,000 TPS
- [ ] Ed25519 signature from Rust matches TypeScript verification byte-for-byte
- [ ] Bloom filter survives bincode round-trip with concurrent inserts
- [ ] Purge ROLLBACK removes all session data; advisory lock prevents concurrent instances

### Must Have
- `fastbloom::AtomicBloomFilter` wrapper with `check_or_insert` and bincode persistence
- Recursive Siphon worker pool with bounded MPSC channels and exponential backoff on 429
- Ed25519-signed Discord Interaction payloads matching `verify.ts` format exactly
- Pre-signed payload buffer for Thruster throughput ≥ 1,000 TPS sustained
- Transaction-scoped DB writes with ROLLBACK-based Purge
- `pg_try_advisory_lock` to prevent concurrent Vessel instances
- `clap` derive CLI with `--app-id`, `--private-key`, `--target-url`, `--seed-player` flags
- `indicatif` multi-progress bars: Discovery Rate, DB Write Latency, Active Cloud Syncs
- Criterion benchmark proving 1K+ TPS

### Must NOT Have (Guardrails)
- **NO** modifications to existing Parley crate code (`src/`, `crates/engine/`, etc.)
- **NO** modifications to `stats-scraper` public API (backward compat required)
- **NO** BrawlStars or Cs2 support (R6 only for V1)
- **NO** Workers KV integration
- **NO** `unwrap()` / `expect()` outside test code
- **NO** blocking the async runtime (`std::thread::sleep`, blocking I/O on tokio tasks)
- **NO** calls to Discord's real API from Thruster
- **NO** config file parsing (`vessel.toml`, `$XDG_CONFIG_HOME`) — CLI args only
- **NO** new Diesel migrations that modify existing production tables
- **NO** TUI (crossterm/ratatui) — indicatif progress bars only
- **NO** `as any` or `@ts-ignore` (this is Rust, but same principle — no type escapes)
- **NO** ASCII art divider comments (`// ======`, `// -------`) per AGENTS.md

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Rust built-in `#[test]`, `#[tokio::test]`, wiremock in stats-scraper)
- **Automated tests**: YES (TDD)
- **Framework**: Rust built-in test framework + wiremock for HTTP integration tests
- **TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI/TUI**: Use `interactive_bash` (tmux) — Run command, validate exit code, check stdout/stderr
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Unit tests**: Use Bash (`cargo test`) — Run test suite, assert pass count + zero failures
- **Benchmarks**: Use Bash (`cargo bench`) — Run criterion, assert throughput ≥ threshold

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + scaffolding):
├── Task 1:  Workspace setup + dependency additions [quick]
├── Task 2:  Hull: Bloom filter module [quick]
├── Task 3:  Ed25519 signing module + compat proof [deep]
├── Task 4:  Diesel migration for vessel session table [quick]
├── Task 5:  CLI skeleton with clap derive [quick]
└── Task 6:  Concurrency primitives: bounded MPSC types [quick]

Wave 2 (After Wave 1 — core modules, MAX PARALLEL):
├── Task 7:  Transaction session manager (depends: 1, 4) [deep]
├── Task 8:  Siphon: Worker pool + recursive crawl engine (depends: 1, 2, 6) [deep]
├── Task 9:  Siphon: Stats-scraper integration + HTML parsing (depends: 8) [unspecified-high]
├── Task 10: Thruster: Interaction payload builder + signing (depends: 1, 3) [deep]
└── Task 11: Thruster: HTTP sender + pre-signed buffer (depends: 10) [unspecified-high]

Wave 3 (After Wave 2 — integration + CLI):
├── Task 12: Siphon DB pipeline: Hull → Worker → Diesel inserts (depends: 7, 8, 9) [deep]
├── Task 13: Thruster end-to-end: Sign → HTTP → metrics (depends: 10, 11) [unspecified-high]
├── Task 14: Purge: Transaction rollback + bloom cleanup + advisory lock (depends: 7) [quick]
└── Task 15: CLI progress bars + session orchestration (depends: 5, 12, 13, 14) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: Task 1 → Task 4 → Task 7 → Task 12 → Task 15 → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|---------|------|
| 1    | —         | 7,8,10  | 1    |
| 2    | —         | 8       | 1    |
| 3    | —         | 10      | 1    |
| 4    | 1         | 7       | 1    |
| 5    | —         | 15      | 1    |
| 6    | —         | 8       | 1    |
| 7    | 1,4       | 12,14   | 2    |
| 8    | 1,2,6     | 9,12    | 2    |
| 9    | 8         | 12      | 2    |
| 10   | 1,3       | 11,13   | 2    |
| 11   | 10        | 13      | 2    |
| 12   | 7,8,9     | 15      | 3    |
| 13   | 10,11     | 15      | 3    |
| 14   | 7         | 15      | 3    |
| 15   | 5,12,13,14 | F1-F4 | 3    |
| F1-F4| 15        | —       | FINAL|

### Agent Dispatch Summary

- **Wave 1**: **6** — T1-T5 → `quick`, T3 → `deep`
- **Wave 2**: **5** — T7,T8 → `deep`, T9,T11 → `unspecified-high`, T10 → `deep`
- **Wave 3**: **4** — T12 → `deep`, T13 → `unspecified-high`, T14 → `quick`, T15 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Workspace Setup + Dependency Additions

  **What to do**:
  - Add `crates/vessel/` to workspace members in root `Cargo.toml`
  - Add new workspace dependencies: `ed25519-dalek`, `fastbloom` (with `serde` feature), `bincode`, `clap` (with `derive` feature), `indicatif`, `hex`, `criterion` (dev)
  - Create `crates/vessel/Cargo.toml` with all dependencies pointing to workspace
  - Create `crates/vessel/src/lib.rs` with module declarations: `pub mod hull; pub mod siphon; pub mod thruster; pub mod purge; pub mod session; pub mod cli; pub mod progress;`
  - Create empty module files: `hull.rs`, `siphon/mod.rs`, `thruster/mod.rs`, `purge.rs`, `session.rs`, `cli.rs`, `progress.rs`
  - Run `cargo build -p vessel` to verify compilation

  **Must NOT do**:
  - Modify existing crate code in `src/`, `crates/engine/`, `crates/stats-scraper/`, or `crates/brawl-stars/`
  - Change existing `stats-scraper` public API
  - Add Diesel migrations that touch existing tables

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Scaffolding task, well-defined file operations
  - **Skills**: []
    - No specialized skills needed for Cargo.toml editing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 5, 6)
  - **Blocks**: Tasks 7, 8, 10
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):
  - `Cargo.toml` (root) — Workspace members list and `[workspace.dependencies]` section. Add `"vessel"` to members array. Add all new deps to workspace dependencies.
  - `crates/stats-scraper/Cargo.toml` — Reference for crate structure, workspace dep syntax, feature flags
  - `crates/engine/Cargo.toml` — Reference for how workspace path deps work

  **Why Each Reference Matters**:
  - Root `Cargo.toml`: Must add `"crates/vessel"` to members and all new deps to `[workspace.dependencies]` following the existing pattern
  - `stats-scraper/Cargo.toml`: Shows the pattern for how workspace crates reference workspace dependencies with `workspace = true`

  **Acceptance Criteria**:
  - [ ] `crates/vessel/Cargo.toml` exists with all dependencies
  - [ ] Root `Cargo.toml` has `"crates/vessel"` in workspace members
  - [ ] Root `Cargo.toml` has `ed25519-dalek`, `fastbloom`, `bincode`, `clap`, `indicatif`, `hex`, `criterion` in `[workspace.dependencies]`

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Crate compiles with zero warnings
    Tool: Bash
    Preconditions: Root Cargo.toml updated, crates/vessel/ created
    Steps:
      1. Run `cargo build -p vessel 2>&1`
      2. Check exit code is 0
      3. Grep output for "warning" — assert none found
    Expected Result: Build succeeds with zero warnings
    Failure Indicators: Exit code non-zero, or any "warning:" lines in output
    Evidence: .sisyphus/evidence/task-1-build-success.txt

  Scenario: Workspace dependency resolution works
    Tool: Bash
    Preconditions: All workspace deps added
    Steps:
      1. Run `cargo check -p vessel 2>&1`
      2. Verify no "failed to resolve" or "could not find" errors
    Expected Result: All dependency versions resolve correctly
    Failure Indicators: Any dependency resolution error
    Evidence: .sisyphus/evidence/task-1-deps-resolve.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(vessel): scaffold crate and add workspace dependencies`
  - Files: `Cargo.toml`, `crates/vessel/Cargo.toml`, `crates/vessel/src/lib.rs`, empty module stubs
  - Pre-commit: `cargo check -p vessel`

- [x] 2. Hull: Bloom Filter Module

  **What to do**:
  - TDD: Write tests first in `crates/vessel/src/hull.rs`
  - Implement `Hull` struct wrapping `fastbloom::AtomicBloomFilter`
  - Constructor: `Hull::with_capacity(expected_items: usize, fp_rate: f64)` — defaults to 400,000 items @ 1% FP
  - `check_or_insert(&self, uid: &str) -> bool` — returns `true` if likely duplicate (FP possible, FN impossible)
  - `contains(&self, uid: &str) -> bool` — read-only check
  - `save(&self, path: &Path) -> Result<()>` — serialize to bincode, write to disk
  - `load(path: &Path) -> Result<Self>` — load from disk, handle corrupted file gracefully (log warning, return fresh filter)
  - `items_inserted(&self) -> u64` — count of insertions for progress reporting
  - `clear(&mut self)` — reset to empty state
  - Write tests: round-trip serialization, concurrent access (8 tokio tasks inserting 50K items each), false positive rate at 400K/1% (≤1.5%), corrupted file handling

  **Must NOT do**:
  - Use `unwrap()`/`expect()` outside test code
  - Create a generic bloom filter abstraction layer
  - Support deletion from bloom filter (false positive rate would degrade)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single module, well-defined API, existing reference implementation from research
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):
  - `fastbloom` crate docs — `AtomicBloomFilter::with_false_pos(fp).expected_items(n)`, `insert()`, `contains()`, serde serialization
  - Draft research in `.sisyphus/drafts/vessel-rust-engine.md` — Bloom sizing: 400K items @ 1% FP ≈ 731 KB, 10 hash functions
  - `crates/vessel/src/lib.rs` — Module declaration (created in Task 1)

  **Why Each Reference Matters**:
  - `fastbloom` API: Must use `AtomicBloomFilter` for lock-free concurrent access, `serde` feature for bincode serialization
  - Draft research: Sizing parameters (731KB, 10 hashes, 1% FP) are verified calculations — use as defaults

  **Acceptance Criteria**:
  - [ ] Test file created: `crates/vessel/src/hull.rs` (tests inline or `tests/hull.rs`)
  - [ ] `cargo test -p vessel hull` → PASS (all 5+ tests)
  - [ ] Hull::with_capacity(400_000, 0.01) creates filter with ~731KB memory footprint
  - [ ] bincode round-trip preserves all inserted items (verify after save/load cycle)

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Bloom filter round-trip survives concurrent inserts
    Tool: Bash
    Preconditions: hull.rs with implementation
    Steps:
      1. Run `cargo test -p vessel hull -- concurrent_insert 2>&1`
      2. Verify 8 concurrent tasks each inserting 50K items all succeed
      3. Verify all 400K items return `contains() == true` after concurrent phase
    Expected Result: All items present, no data loss under concurrent access
    Failure Indicators: Any test failure, panic, or missing items after concurrent phase
    Evidence: .sisyphus/evidence/task-2-concurrent-test.txt

  Scenario: Corrupted bloom file produces fresh filter, not a crash
    Tool: Bash
    Preconditions: hull.rs with implementation
    Steps:
      1. Write garbage bytes to a file
      2. Call `Hull::load(path)` on the corrupted file
      3. Assert: returns `Ok(Hull)` with a fresh (empty) filter, not `Err`
      4. Verify `items_inserted() == 0`
    Expected Result: Graceful fallback to empty filter with no panic
    Failure Indicators: Returns Err, panics, or contains stale data
    Evidence: .sisyphus/evidence/task-2-corrupt-file-test.txt

  Scenario: False positive rate is within configured boundary
    Tool: Bash
    Preconditions: hull.rs with implementation
    Steps:
      1. Create Hull with 400K items @ 1% FP
      2. Insert 400K items
      3. Check 10K non-inserted items
      4. Count false positives, assert rate ≤ 1.5%
    Expected Result: False positive rate ≤ 1.5% (slight headroom above configured 1%)
    Failure Indicators: Rate exceeds 1.5%, suggesting misconfigured filter
    Evidence: .sisyphus/evidence/task-2-fp-rate-test.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(vessel): implement Hull bloom filter module with bincode persistence`
  - Files: `crates/vessel/src/hull.rs`
  - Pre-commit: `cargo test -p vessel hull`

- [x] 3. Ed25519 Signing Module + Compat Proof

  **What to do**:
  - TDD: Write tests first
  - Create `crates/vessel/src/thruster/signing.rs` — Ed25519 signing module
  - Implement `fn sign_interaction(private_key: &[u8; 32], timestamp: &str, body: &[u8]) -> String`
    - Construct message: `timestamp.as_bytes() ++ body` (exact concatenation, no delimiter)
    - Sign with `ed25519_dalek::SigningKey::from_bytes(private_key)`
    - Return hex-encoded signature string
  - Implement `fn verify_signature(public_key: &[u8; 32], signature_hex: &str, timestamp: &str, body: &[u8]) -> bool`
    - Mirror `packages/runtime/src/utils/verify.ts` logic
    - Construct same message: `timestamp.as_bytes() ++ body`
    - Verify with `ed25519_dalek::VerifyingKey::from_bytes(public_key)`
  - Write **compatibility proof test**: Generate a keypair, sign `"1234567890" + r#"{"type":1}"#` in both Rust and Node.js (or hardcode the expected hex), verify the Rust signature matches
  - Write edge case tests: empty body, Unicode body, large body (10KB+), wrong key format detection

  **Must NOT do**:
  - Use `unwrap()`/`expect()` outside test code
  - Implement any HTTP client logic (that's in Task 11)
  - Call Discord's real API

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Cryptographic correctness is critical — must prove byte-for-byte compatibility with TypeScript
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: Task 10
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):
  - `packages/runtime/src/utils/verify.ts` — THE reference for signature format. Lines showing: `timestamp_bytes + body_bytes` concatenation (no delimiter), hex-encoded signature in `x-signature-ed25519` header, timestamp in `x-signature-timestamp` header
  - `ed25519-dalek` crate documentation — `SigningKey`, `VerifyingKey`, `sign()`/`verify()` API
  - `hex` crate — For hex encoding/decoding of Ed25519 signatures and keys

  **Why Each Reference Matters**:
  - `verify.ts`: This is the EXACT format Thruster must produce. Any deviation = signatures won't verify. The construction is `timestamp.as_bytes() ++ body` with no separator between.
  - `ed25519-dalek`: Rust implementation of Ed25519 — must use `SigningKey::sign_prehashed()` or `sign()` method correctly
  - `hex`: Signature bytes must be hex-encoded to match the `x-signature-ed25519` header format

  **Acceptance Criteria**:
  - [ ] Test file created: `crates/vessel/src/thruster/signing.rs` with inline tests
  - [ ] `cargo test -p vessel signing` → PASS
  - [ ] Compat test: Rust Ed25519 signature matches expected hex output for known input
  - [ ] Empty body, Unicode body, and 10KB+ body all produce valid signatures
  - [ ] Invalid private key (wrong length, non-hex) returns clear error, not panic

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Ed25519 signature matches TypeScript verification format
    Tool: Bash
    Preconditions: signing.rs with implementation and compat tests
    Steps:
      1. Generate test keypair: `SigningKey::from_bytes([0u8; 32])`
      2. Sign: timestamp="1234567890", body=br#"{"type":1}"#
      3. Construct message as b"1234567890" ++ br#"{"type":1}"# (no delimiter)
      4. Verify signature hex matches expected output
      5. Also verify: `verify_signature(public_key, hex_sig, "1234567890", body)` returns true
    Expected Result: Signature hex matches exactly, verification succeeds
    Failure Indicators: Signature doesn't verify, or hex format differs from TypeScript
    Evidence: .sisyphus/evidence/task-3-ed25519-compat.txt

  Scenario: Wrong-length private key produces clear error
    Tool: Bash
    Preconditions: signing.rs with error handling
    Steps:
      1. Call `sign_interaction(&[0u8; 31], "1234567890", b"{}")` — 31 bytes instead of 32
      2. Assert: returns error "private key must be 32 bytes", not a panic
    Expected Result: Graceful error message, no crash
    Failure Indicators: Panic, unwrap, or unclear error
    Evidence: .sisyphus/evidence/task-3-invalid-key.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(vessel): implement Ed25519 signing module with compat proof`
  - Files: `crates/vessel/src/thruster/signing.rs`, `crates/vessel/src/thruster/mod.rs`
  - Pre-commit: `cargo test -p vessel signing`

- [x] 4. Diesel Migration for Vessel Session Table

  **What to do**:
  - TDD: Write migration first
  - Create new Diesel migration: `diesel migration generate vessel_sessions`
  - Migration UP: Create `vessel_sessions` table with columns:
    - `id SERIAL PRIMARY KEY`
    - `session_id UUID NOT NULL UNIQUE` — identifies a Vessel session
    - `started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
    - `status TEXT NOT NULL DEFAULT 'active'` — 'active' | 'purged' | 'completed'
    - `seed_player TEXT NOT NULL` — starting UID for the crawl
    - `players_discovered INT4 NOT NULL DEFAULT 0` — count of players found by Siphon
    - `players_inserted INT4 NOT NULL DEFAULT 0` — count of players written to DB
    - `interactions_sent INT4 NOT NULL DEFAULT 0` — count of Thruster interactions
  - Migration DOWN: `DROP TABLE IF EXISTS vessel_sessions;`
  - Create Rust model in `crates/vessel/src/session.rs` matching table with Diesel derive macros
  - Write test: `cargo test -p vessel session` verifying migration up/down works

  **Must NOT do**:
  - Modify any existing migration files
  - Add columns or constraints to existing Parley tables (players, matches, etc.)
  - Use `diesel print-schema` — Vessel's schema is separate from Parley's hand-kept schema

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single migration + model struct, well-defined schema
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1 adds workspace deps)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1 (needs diesel dependency in Cargo.toml)

  **References** (CRITICAL — Be Exhaustive):
  - `migrations/2026-05-12-120500_players_and_stats/up.sql` — Reference for Diesel migration SQL style (naming conventions, timestamp format, NOT NULL patterns)
  - `src/db/models.rs` — Reference for Diesel model derive macros (`Queryable`, `Insertable`, `AsChangeset`)
  - `src/db/schema.rs` — Reference for Diesel table macro style (NOT to be modified, just for pattern reference)
  - `src/db/pool.rs` — Reference for `PoolConfig` and `init_pool()` pattern for connection management
  - `diesel.toml` — Diesel CLI configuration

  **Why Each Reference Matters**:
  - Migration SQL files: Shows the exact SQL style and naming conventions used in this project (BIGINT timestamps, TEXT status columns, NOT NULL patterns)
  - `models.rs`: Shows how Diesel structs are derived (lifetimes on Insertable, field types like `Game`, `i32`/`i64`/`f64`, `Option<String>`)
  - `pool.rs`: Vessel will need its own pool, and should follow the same `PoolConfig::from_env()` + `init_pool()` pattern

  **Acceptance Criteria**:
  - [ ] Migration file exists: `migrations/YYYY-MM-DD-HHMMSS_vessel_sessions/up.sql`
  - [ ] Down migration exists: `migrations/YYYY-MM-DD-HHMMSS_vessel_sessions/down.sql`
  - [ ] `crates/vessel/src/session.rs` has `VesselSession`, `NewVesselSession` structs with Diesel derives
  - [ ] `cargo test -p vessel session` → PASS
  - [ ] Migration applies cleanly: `diesel migration run` succeeds
  - [ ] Migration rolls back cleanly: `diesel migration redo` succeeds

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Migration applies and rolls back cleanly
    Tool: Bash
    Preconditions: DATABASE_URL set, diesel CLI available
    Steps:
      1. Run `diesel migration run` in project root
      2. Verify `vessel_sessions` table exists: `\dt vessel_sessions` via psql
      3. Run `diesel migration redo`
      4. Verify table still exists (recreated after rollback + re-apply)
    Expected Result: Table created with correct schema, all columns present
    Failure Indicators: Migration fails, missing columns, wrong types
    Evidence: .sisyphus/evidence/task-4-migration.txt

  Scenario: Model structs compile and deserialize correctly
    Tool: Bash
    Preconditions: session.rs written
    Steps:
      1. Run `cargo test -p vessel session 2>&1`
      2. Verify all session model tests pass
    Expected Result: All model struct tests pass
    Failure Indicators: Compilation errors or test failures
    Evidence: .sisyphus/evidence/task-4-model-test.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(vessel): add vessel_sessions migration and model`
  - Files: `migrations/.../up.sql`, `migrations/.../down.sql`, `crates/vessel/src/session.rs`
  - Pre-commit: `diesel migration run && cargo test -p vessel session`

- [x] 5. CLI Skeleton with Clap Derive

  **What to do**:
  - TDD: Write command structure tests first
  - Create `crates/vessel/src/cli.rs` with clap derive `#[derive(Parser)]`
  - Define `VesselCli` enum with subcommands: `Siphon`, `Thruster`, `Purge`
  - `Siphon` args: `--seed-player <UID>`, `--platform <pc|xbox|playstation>`, `--max-depth <N>`, `--bloom-fp-rate <f64>`, `--channel-capacity <usize>`
  - `Thruster` args: `--app-id <ID>`, `--private-key <HEX>`, `--target-url <URL>`, `--tps <N>`, `--duration <secs>`, `--interaction-type <ping|application_command|message_component>`
  - `Purge` args: `--session-id <UUID>`, `--bloom-cache-path <PATH>`
  - Global args: `--database-url <URL>`, `--verbose`, `--bloom-cache-path <PATH>`
  - Validate `--private-key` is exactly 64 hex chars (32 bytes) at parse time
  - Write test: verify clap arg parsing for each subcommand

  **Must NOT do**:
  - Implement business logic in CLI module — only arg definitions and validation
  - Use `std::env` directly — everything through clap
  - Add config file support (`vessel.toml`, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Arg definitions are well-specified and mechanical
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6)
  - **Blocks**: Task 15
  - **Blocked By**: None (can start immediately, but needs Task 1 for clap dep)

  **References** (CRITICAL — Be Exhaustive):
  - `clap` crate documentation — `#[derive(Parser)]`, `#[derive(Subcommand)]`, `#[derive(Args)]` derive macros
  - `crates/stats-scraper/src/fetch.rs` — Reference for `StatsPlatform` enum (PC/Xbox/Playstation)
  - `src/db/pool.rs` — Reference for `PoolConfig::from_env()` pattern (DATABASE_URL)

  **Why Each Reference Matters**:
  - `clap`: Must use derive API consistently, not builder API
  - `StatsPlatform`: Siphon's `--platform` arg must match the existing enum values (pc, xbox, playstation)
  - `PoolConfig`: Shows how this project handles database URL configuration from env vars

  **Acceptance Criteria**:
  - [ ] `crates/vessel/src/cli.rs` exists with `VesselCli`, `SiphonArgs`, `ThrusterArgs`, `PurgeArgs`
  - [ ] `--private-key` validation rejects non-64-hex-char input
  - [ ] `cargo test -p vessel cli` → PASS (arg parsing tests)

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: CLI arg parsing works for Siphon subcommand
    Tool: Bash
    Preconditions: cli.rs implemented
    Steps:
      1. Parse: `vessel siphon --seed-player "some-uid" --platform pc --max-depth 5`
      2. Verify seed_player == "some-uid", platform == PC, max_depth == 5
    Expected Result: All args parsed correctly with defaults for missing optional args
    Failure Indicators: Parse error, wrong values, panic on optional args
    Evidence: .sisyphus/evidence/task-5-cli-siphon.txt

  Scenario: Invalid private key produces clear error
    Tool: Bash
    Preconditions: cli.rs implemented
    Steps:
      1. Parse: `vessel thruster --app-id 123 --private-key "not-hex" --target-url http://localhost:8080`
      2. Assert: error message contains "64 hex characters" or "invalid private key"
    Expected Result: Clear validation error, not a panic or cryptic message
    Failure Indicators: Panic, unwrap, or unclear error
    Evidence: .sisyphus/evidence/task-5-cli-invalid-key.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(vessel): add CLI skeleton with clap derive`
  - Files: `crates/vessel/src/cli.rs`
  - Pre-commit: `cargo test -p vessel cli`

- [x] 6. Concurrency Primitives: Bounded MPSC Types

  **What to do**:
  - TDD: Write tests first
  - Create `crates/vessel/src/siphon/channel.rs` — bounded MPSC channel types
  - Define `SiphonCommand` enum: `Crawl { uid: String, depth: usize }`, `Terminate`
  - Define `SiphonResult` struct: `uid: String`, `depth: usize`, `discovered_uids: Vec<String>`, `stats: Option<ScrapedStatsCollection>`
  - Define `CrawlConfig` struct: `max_depth: usize`, `platform: StatsPlatform`, `channel_capacity: usize`, `rate_limit_per_second: u32`, `retry_policy: RetryPolicy`
  - Implement `fn create_channels(capacity: usize) -> (Sender<SiphonCommand>, Receiver<SiphonCommand>)` — bounded MPSC
  - Implement backpressure: `Sender::send()` blocks when channel is full (no `try_send` + drop)
  - Implement graceful shutdown: `Terminate` command causes all workers to drain and exit
  - Write tests: bounded capacity enforcement, graceful shutdown, concurrent send/receive

  **Must NOT do**:
  - Use unbounded channels (`tokio::sync::mpsc::unbounded_channel`)
  - Drop items when channel is full (use blocking backpressure, not dropping)
  - Create a generic worker pool abstraction — specific to Siphon's needs

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple type definitions and bounded channel setup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5)
  - **Blocks**: Task 8
  - **Blocked By**: None (needs Task 1 for tokio dep, but type definitions are independent)

  **References** (CRITICAL — Be Exhaustive):
  - `tokio::sync::mpsc` documentation — Bounded channel API, `sender.send().await`, `receiver.recv().await`
  - `crates/stats-scraper/src/fetch.rs` — `RetryPolicy` struct (max_attempts, initial_backoff_ms, max_backoff_ms) — reuse or mirror this type
  - `crates/stats-scraper/src/fetch.rs` — `StatsPlatform` enum (PC, Xbox, Playstation) — import directly from stats-scraper crate

  **Why Each Reference Matters**:
  - `tokio::sync::mpsc`: Must use bounded channel with `sender.send().await` for backpressure, not `try_send()` which would require drop logic
  - `RetryPolicy`: Siphon should reuse or mirror this existing struct for consistency with stats-scraper
  - `StatsPlatform`: Must import directly from stats-scraper rather than redefining

  **Acceptance Criteria**:
  - [ ] `crates/vessel/src/siphon/channel.rs` exists with `SiphonCommand`, `SiphonResult`, `CrawlConfig`
  - [ ] `cargo test -p vessel channel` → PASS
  - [ ] Channel blocks sender when full (no dropped items)
  - [ ] Terminate command causes all receivers to exit gracefully

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Bounded channel enforces capacity with backpressure
    Tool: Bash
    Preconditions: channel.rs implemented with tests
    Steps:
      1. Create channel with capacity=5
      2. Send 5 items — all succeed immediately
      3. Attempt to send 6th item — it blocks (use timeout to verify)
      4. Receive 1 item from receiver
      5. Send 6th item — now succeeds
    Expected Result: Sender blocks at capacity, no items dropped
    Failure Indicators: Items dropped, sender doesn't block, panic on capacity
    Evidence: .sisyphus/evidence/task-6-bounded-channel.txt

  Scenario: Graceful shutdown with Terminate command
    Tool: Bash
    Preconditions: channel.rs implemented with tests
    Steps:
      1. Create channel and spawn 4 worker tasks
      2. Send 10 Crawl commands, then 4 Terminate commands
      3. Verify all workers process remaining items then exit
      4. Verify no tasks are stuck after 5 seconds
    Expected Result: All workers drain their current item, then exit cleanly
    Failure Indicators: Worker panic, tasks still running after timeout, lost items
    Evidence: .sisyphus/evidence/task-6-graceful-shutdown.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(vessel): add Siphon concurrency primitives and bounded MPSC types`
  - Files: `crates/vessel/src/siphon/channel.rs`, `crates/vessel/src/siphon/mod.rs`
  - Pre-commit: `cargo test -p vessel channel`

- [x] 7. Transaction Session Manager

  **What to do**:
  - TDD: Write tests first
  - Create `crates/vessel/src/session.rs` — session-scoped transaction management
  - Define `VesselSession` struct that holds:
    - `session_id: Uuid` — unique session identifier
    - `db_pool: DbPool` — Vessel's own connection pool (not shared with Parley)
    - `conn: Option<AsyncPgConnection>` — the transaction connection
    - `started_at: chrono::DateTime<Utc>`
  - Implement `VesselSession::start(database_url: &str, seed_player: &str) -> Result<Self>`
    - Create connection pool with configurable max (default: 32, override via `DB_POOL_MAX`)
    - Acquire a connection from the pool
    - Begin a PostgreSQL transaction: `BEGIN TRANSACTION`
    - Acquire `pg_try_advisory_lock(session_id_hash)` — fail with clear error if lock is held
    - Insert a `vessel_sessions` row with status='active'
  - Implement `VesselSession::purge(self) -> Result<()>`
    - ROLLBACK the transaction — all Siphon DB writes disappear
    - Delete bloom cache file (path from `--bloom-cache-path` or default)
    - Release the advisory lock
    - Update session status to 'purged'
  - Implement `VesselSession::complete(self) -> Result<()>`
    - COMMIT the transaction
    - Release the advisory lock
    - Update session status to 'completed'
  - Implement `VesselSession::connection(&mut self) -> &mut AsyncPgConnection` — borrow the transaction connection for Diesel operations
  - Write tests: session start acquires lock, purge rolls back all inserts, concurrent session fails to start

  **Must NOT do**:
  - Share connection pool with main Parley process (Vessel is a CLI tool, runs independently)
  - Use `COMMIT` inside Siphon worker loops (only at session end)
  - Hold advisory lock after purge/complete

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Transaction management and advisory lock coordination is correctness-critical and complex
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 and 4)
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 10, 11)
  - **Blocks**: Tasks 12, 14
  - **Blocked By**: Tasks 1 (workspace setup), 4 (migration + model)

  **References** (CRITICAL — Be Exhaustive):
  - `src/db/pool.rs` — `DbPool` type alias, `PoolConfig::from_env()`, `init_pool()` pattern. Vessel should follow this exact pattern for pool creation.
  - `src/db/models.rs` — Diesel model derive patterns (Queryable, Insertable, Identifiable). Follow these patterns for `VesselSession`.
  - `migrations/2026-05-12-120000_init_games_and_auth/up.sql` — Reference for timestamp types (`TIMESTAMPTZ`), UUID columns, and default values.
  - Diesel async documentation (`diesel-async` crate) — `AsyncPgConnection`, `begin_transaction()`, `rollback_transaction()`, `commit_transaction()` API.

  **Why Each Reference Matters**:
  - `pool.rs`: Shows the exact pattern for creating a bb8 pool with TLS. Vessel must replicate this to create its own pool.
  - `models.rs`: Shows the derive macro patterns (lifetimes for Insertable, field types) used in this project.
  - Diesel async: The transaction API is different from sync Diesel. Must use `conn.begin_transaction().await`, `conn.rollback().await`, `conn.commit().await`.
  - Migration SQL: Shows the timestamp type conventions (BIGINT for epoch millis vs TIMESTAMPTZ) used in this project.

  **Acceptance Criteria**:
  - [ ] Test file: `crates/vessel/src/session.rs` with inline tests
  - [ ] `cargo test -p vessel session` → PASS
  - [ ] Session start acquires advisory lock; second session fails with clear error
  - [ ] Purge rolls back all DB writes (insert row, purge, row no longer exists)
  - [ ] Complete commits all DB writes (insert row, complete, row persists)

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Purge rolls back all inserts
    Tool: Bash
    Preconditions: Running Postgres with vessel_sessions table, session.rs implemented
    Steps:
      1. Start a VesselSession with a test database
      2. Insert a player row using the session connection
      3. Query the player row — assert it exists (within the transaction)
      4. Call `session.purge()`
      5. Query the player row — assert it does NOT exist
    Expected Result: Player row visible during session, absent after purge
    Failure Indicators: Row still exists after purge, or not visible during session
    Evidence: .sisyphus/evidence/task-7-purge-rollback.txt

  Scenario: Concurrent session fails with clear error
    Tool: Bash
    Preconditions: Two VesselSession instances attempting to start
    Steps:
      1. Start VesselSession A successfully
      2. Attempt to start VesselSession B while A holds the advisory lock
      3. Assert B receives clear error: "another vessel session is already active"
      4. Purge A
      5. Start B — assert it succeeds
    Expected Result: Second session fails gracefully, succeeds after first session ends
    Failure Indicators: Panic, deadlock, unclear error message, or second session starts
    Evidence: .sisyphus/evidence/task-7-advisory-lock.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(vessel): implement transaction session manager with advisory lock`
  - Files: `crates/vessel/src/session.rs`
  - Pre-commit: `cargo test -p vessel session`

- [x] 8. Siphon: Worker Pool + Recursive Crawl Engine

  **What to do**:
  - TDD: Write tests first
  - Create `crates/vessel/src/siphon/worker.rs` — the recursive crawl engine
  - Define `SiphonWorker` struct holding: `sender: Sender<SiphonCommand>`, `receiver: Receiver<SiphonCommand>`, `hull: Arc<Hull>`, `client: StatsClient`, `config: CrawlConfig`
  - Implement `Siphon::new(hull: Arc<Hull>, client: StatsClient, config: CrawlConfig) -> Self`
  - Implement recursive crawl logic:
    1. Receive `Crawl { uid, depth }` command from channel
    2. Check Hull bloom filter: if `uid` is known, skip and continue
    3. If new: fetch stats from stats-scraper's `StatsClient`
    4. If HTTP 429: apply exponential backoff (reuse `RetryPolicy`)
    5. If fetch succeeds: insert uid into Hull, parse match participants (up to 10 per match)
    6. For each discovered uid: send `Crawl { uid, depth + 1 }` to channel IF depth < max_depth
    7. When depth >= max_depth or channel is empty: send `Terminate` to other workers
  - Implement `Siphon::spawn_workers(n: usize) -> JoinSet` — spawn N tokio tasks
  - Implement `Siphon::drain_results() -> Vec<SiphonResult>` — collect results from workers
  - Handle `Terminate` command: worker drains current work, then exits
  - Write tests: single-crawl cycle, recursive depth limiting, bloom skip, 429 backoff (mock server)

  **Must NOT do**:
  - Fire HTTP requests without rate limiting (minimum inter-request delay)
  - Crawl without depth cap (unbounded recursion)
  - Use unbounded channels (use bounded from Task 6)
  - Call Discord's real API

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Recursive crawl engine with backoff, bloom integration, and depth limiting is algorithmically complex
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: AFTER Tasks 1, 2, 6 complete
  - **Parallel Group**: Wave 2 (with Tasks 7, 9, 10, 11)
  - **Blocks**: Tasks 9, 12
  - **Blocked By**: Tasks 1 (workspace), 2 (Hull), 6 (channels)

  **References** (CRITICAL — Be Exhaustive):
  - `crates/stats-scraper/src/fetch.rs` — `StatsClient` with `RetryPolicy`, `StatsFetchError`, `fetch_stats_collection()`. This is the HTTP client Siphon reuses.
  - `crates/stats-scraper/src/fetch.rs` lines showing `is_retryable_status(429)` and exponential backoff loop — mirror this pattern
  - `crates/vessel/src/siphon/channel.rs` — Bounded channel types from Task 6 (`SiphonCommand`, `SiphonResult`, `CrawlConfig`)
  - `crates/vessel/src/hull.rs` — `Hull::check_or_insert()` from Task 2
  - `crates/stats-scraper/src/backends/r6.rs` — `R6Backend` wrapping `StatsClient`, shows how to call `fetch_stats_collection`

  **Why Each Reference Matters**:
  - `StatsClient`: Siphon MUST reuse this client for HTTP requests. Do NOT create a new reqwest client.
  - `RetryPolicy`: Mirror the exact same backoff pattern (initial_backoff_ms: 200, max_backoff_ms: 2000, max_attempts: 2).
  - `channel.rs`: The `SiphonCommand::Crawl` and `Terminate` variant types defined in Task 6.
  - `Hull`: The `check_or_insert()` method returns `true` for likely duplicates — use this to skip already-seen UIDs.
  - `R6Backend`: Shows the correct way to call `StatsClient::fetch_stats_collection()`.

  **Acceptance Criteria**:
  - [ ] Test file: `crates/vessel/src/siphon/worker.rs` with tests
  - [ ] `cargo test -p vessel siphon_worker` → PASS
  - [ ] Single-crawl cycle: seed UID → bloom check → fetch → parse → send discovered UIDs
  - [ ] Depth limiting: depth >= max_depth stops recursion
  - [ ] Bloom skip: known UID is skipped (no HTTP request)
  - [ ] 429 backoff: mock server returns 429, worker backs off and retries

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Recursive crawl respects depth limit
    Tool: Bash
    Preconditions: worker.rs implemented with tests
    Steps:
      1. Create Siphon with max_depth=2
      2. Seed with a UID at depth 0
      3. Mock server returns 3 discovered UIDs per fetch
      4. Verify: depth 1 UIDs are crawled, depth 2 UIDs are NOT sent to channel
    Expected Result: Crawl stops at max_depth, no depth 2+ commands queued
    Failure Indicators: Depth exceeds max_depth, or no crawling occurs at depth 1
    Evidence: .sisyphus/evidence/task-8-depth-limit.txt

  Scenario: Bloom filter skips known UIDs
    Tool: Bash
    Preconditions: worker.rs implemented with Hull integration
    Steps:
      1. Create Siphon with Hull pre-populated with "known-uid"
      2. Send Crawl command for "known-uid"
      3. Verify: no HTTP request is made (bloom filter returns true for check_or_insert)
      4. Verify: worker immediately continues to next command
    Expected Result: Known UID is skipped without any HTTP request
    Failure Indicators: HTTP request sent for known UID, worker stalls
    Evidence: .sisyphus/evidence/task-8-bloom-skip.txt

  Scenario: 429 response triggers exponential backoff
    Tool: Bash
    Preconditions: worker.rs implemented with mock server (wiremock)
    Steps:
      1. Configure mock server to return 429 on first request, then 200
      2. Create Siphon with RetryPolicy { max_attempts: 2, initial_backoff_ms: 50, max_backoff_ms: 200 }
      3. Send Crawl command
      4. Verify: two HTTP requests made (initial + retry after backoff)
      5. Verify: second request succeeds
    Expected Result: Worker backs off on 429 and retries, eventually succeeds
    Failure Indicators: Worker gives up immediately, or makes more than 2 requests
    Evidence: .sisyphus/evidence/task-8-backoff.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(vessel): implement Siphon worker pool with recursive crawl engine`
  - Files: `crates/vessel/src/siphon/worker.rs`
  - Pre-commit: `cargo test -p vessel siphon_worker`

- [x] 9. Siphon: Stats-Scraper Integration + HTML Parsing

  **What to do**:
  - TDD: Write tests first
  - Create `crates/vessel/src/siphon/parser.rs` — match participant extraction from scraped data
  - Implement `fn extract_match_participants(collection: &ScrapedStatsCollection) -> Vec<String>`
    - Extract opponent/player UIDs from match history data within a `ScrapedStatsCollection`
    - Use `ScrapedStatsCollection::by_season` to iterate over seasons and find match participant references
    - Return up to 10 UIDs per match (as per spec)
  - Create `crates/vessel/src/siphon/scraper_bridge.rs` — adapter from stats-scraper types to Siphon types
  - Implement `SiphonFetcher` trait or direct integration that bridges `StatsClient::fetch_stats_collection` → `SiphonResult`
  - Handle `StatsFetchError` variants: `ProfileNotFound` (skip and log), `HttpStatus(429)` (backoff), `Network` (retry), `InvalidPayload` (skip and log)
  - Write tests: parsing match participants from known HTML, extracting UIDs, error handling for each fetch error variant

  **Must NOT do**:
  - Modify `stats-scraper` crate's public API
  - Re-implement HTTP scraping logic — must reuse `StatsClient`
  - Parse raw HTML directly — use `scrape_html_stats_collection()` from stats-scraper

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration between two crates requires understanding both APIs, plus Nuxt data parsing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 12
  - **Blocked By**: Task 8 (worker pool needs parser results)

  **References** (CRITICAL — Be Exhaustive):
  - `crates/stats-scraper/src/fetch.rs` — `StatsClient::fetch_stats_collection()`, `StatsFetchError`, `StatsFetchErrorKind`, `RetryPolicy`
  - `crates/stats-scraper/src/scrape.rs` — `ScrapedStatsCollection`, `ScrapedStats`, `StatsProfile` — the types returned by the scraper
  - `crates/stats-scraper/src/lib.rs` — Public API re-exports: `use stats_scraper::{StatsClient, ScrapedStatsCollection, StatsPlatform, RetryPolicy}`
  - `crates/stats-scraper/src/nuxt.rs` — `NuxtResolver` for understanding the flat JSON array structure (may need to extract opponent UIDs from payload)
  - `crates/stats-scraper/src/metrics.rs` — `CalculatedMetrics` (KOST etc) — understand what fields are available

  **Why Each Reference Matters**:
  - `fetch.rs`: Siphon calls `StatsClient::fetch_stats_collection()` and must handle all `StatsFetchErrorKind` variants correctly
  - `scrape.rs`: `ScrapedStatsCollection` contains `by_season: BTreeMap<String, ScrapedStats>` — this is what Siphon parses for match data
  - `nuxt.rs`: Some opponent UID data might be in the raw Nuxt payload and not surfaced by `ScrapedStatsCollection`. May need to use `NuxtResolver` directly.
  - `lib.rs`: The public API that Siphon imports from

  **Acceptance Criteria**:
  - [ ] Test file: `crates/vessel/src/siphon/parser.rs` with tests
  - [ ] `cargo test -p vessel siphon_parser` → PASS
  - [ ] Parsing known HTML produces correct list of match participant UIDs
  - [ ] Each `StatsFetchErrorKind` is handled correctly (skip, retry, or abort)
  - [ ] No more than 10 UIDs extracted per match

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Extract match participants from scraped stats
    Tool: Bash
    Preconditions: parser.rs implemented with test fixtures
    Steps:
      1. Load a known-good ScrapedStatsCollection test fixture
      2. Call extract_match_participants
      3. Verify: returns up to 10 UID strings
      4. Verify: UIDs are valid format (non-empty, reasonable length)
    Expected Result: Correct list of match participant UIDs extracted
    Failure Indicators: Empty list, malformed UIDs, more than 10 per match
    Evidence: .sisyphus/evidence/task-9-parser.txt

  Scenario: Error handling for profile not found
    Tool: Bash
    Preconditions: scraper_bridge.rs implemented
    Steps:
      1. Mock StatsClient to return StatsFetchError { kind: ProfileNotFound }
      2. Call SiphonFetcher with the mock client
      3. Verify: returns Skipped result, no crash, no retry
    Expected Result: ProfileNotFound errors are skipped gracefully, worker continues
    Failure Indicators: Panic, infinite retry, or worker crash
    Evidence: .sisyphus/evidence/task-9-error-handling.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(vessel): integrate stats-scraper and implement HTML parsing bridge`
  - Files: `crates/vessel/src/siphon/parser.rs`, `crates/vessel/src/siphon/scraper_bridge.rs`
  - Pre-commit: `cargo test -p vessel siphon_parser`

- [x] 10. Thruster: Interaction Payload Builder + Ed25519 Signing

  **What to do**:
  - TDD: Write tests first
  - Create `crates/vessel/src/thruster/payload.rs` — Discord Interaction object builder
  - Define `InteractionPayload` struct matching the Discord `APIInteraction` type:
    - `type_: InteractionType` (Ping=1, ApplicationCommand=2, MessageComponent=3, Autocomplete=4, ModalSubmit=5)
    - `id: String` — snowflake ID
    - `application_id: String` — Discord application ID
    - `token: String` — interaction token
    - `data: Option<serde_json::Value>` — command data
    - `guild_id: Option<String>`
    - `channel_id: Option<String>`
    - `member: Option<serde_json::Value>`
    - `user: Option<serde_json::Value>`
  - Implement `InteractionPayload::builder() -> InteractionBuilder` with fluent API
  - Implement `InteractionPayload::to_json(&self) -> String` — serialize to JSON matching Discord's schema exactly
  - Create `crates/vessel/src/thruster/signer.rs` — re-export and extend Task 3's signing module
  - Implement `fn sign_payload(payload: &InteractionPayload, private_key: &[u8; 32]) -> SignedRequest`
    - `SignedRequest { headers: HeaderMap, body: Vec<u8> }` with `x-signature-ed25519` and `x-signature-timestamp` headers
  - Implement `PreSignedBuffer` struct:
    - Pre-generates N signed payloads at startup
    - Ring buffer with `buf_size` capacity
    - `fn get_next(&self) -> SignedRequest` — returns next pre-signed payload, rotates timestamp when needed
    - Re-sign when timestamp drifts beyond threshold (5 minutes per Discord spec)
  - Write tests: payload serialization matches Discord schema, signing produces valid headers, pre-signed buffer rotates correctly

  **Must NOT do**:
  - Call Discord's real API
  - Use `unwrap()`/`expect()` outside test code
  - Pre-sign with stale timestamps (older than Discord's 5-minute window)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must match Discord's API schema exactly; cryptographic signing correctness is critical
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: AFTER Tasks 1 and 3 complete
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 11)
  - **Blocks**: Tasks 11, 13
  - **Blocked By**: Tasks 1 (workspace), 3 (signing module)

  **References** (CRITICAL — Be Exhaustive):
  - `packages/runtime/src/utils/verify.ts` — THE reference for signature format. Message = `timestamp.as_bytes() ++ body`, signature hex-encoded in `x-signature-ed25519` header, timestamp in `x-signature-timestamp` header.
  - `packages/runtime/src/interactions/base.ts` — `InteractionWithCommonFields` type showing all fields: `application_id`, `token`, `id`, `guild_id`, `channel_id`, `member`, `user`, `guild_locale`
  - `packages/runtime/src/types/index.ts` — `DiscordRuntimeEnv` with `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID` field names
  - `crates/vessel/src/thruster/signing.rs` — Task 3's signing module (`sign_interaction`, `verify_signature`)

  **Why Each Reference Matters**:
  - `verify.ts`: Producing signatures that this code can verify is the entire point. Match it exactly.
  - `base.ts`: The `InteractionWithCommonFields` type defines ALL required fields. Thruster's payload must include every field.
  - `types/index.ts`: Shows the env var names for Discord credentials. Thruster uses `--app-id` and `--private-key` CLI flags instead.
  - `signing.rs`: Reuse the proven signing module from Task 3. Don't re-implement Ed25519 signing.

  **Acceptance Criteria**:
  - [ ] Test files: `payload.rs`, `signer.rs` with inline tests
  - [ ] `cargo test -p vessel thruster_payload` → PASS
  - [ ] Serialized payload JSON matches Discord `APIInteraction` schema
  - [ ] Pre-signed buffer rotates timestamps within 5-minute window
  - [ ] Signed payload headers verify correctly against known public key

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Interaction payload matches Discord API schema
    Tool: Bash
    Preconditions: payload.rs implemented
    Steps:
      1. Create InteractionPayload::builder().type_(ApplicationCommand).id("1234567890").application_id("app_id").token("token").build()
      2. Serialize to JSON: payload.to_json()
      3. Assert: JSON contains "type", "id", "application_id", "token" fields
      4. Assert: "type" value is 2 (ApplicationCommand)
    Expected Result: Serialized JSON matches Discord's Interaction object schema exactly
    Failure Indicators: Missing fields, wrong types, incorrect enum values
    Evidence: .sisyphus/evidence/task-10-payload-schema.txt

  Scenario: Pre-signed buffer rotates stale timestamps
    Tool: Bash
    Preconditions: PreSignedBuffer implemented
    Steps:
      1. Create PreSignedBuffer with capacity=100, timestamp=now
      2. Call get_next() 50 times — all have timestamps from initialization
      3. Wait 6 minutes (or mock time)
      4. Call get_next() — verify timestamp is refreshed, not stale
    Expected Result: Timestamps rotate within 5-minute Discord validation window
    Failure Indicators: Timestamp is older than 5 minutes, or buffer doesn't re-sign
    Evidence: .sisyphus/evidence/task-10-presigned-buffer.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(vessel): implement Thruster payload builder + Ed25519 signing`
  - Files: `crates/vessel/src/thruster/payload.rs`, `crates/vessel/src/thruster/signer.rs`
  - Pre-commit: `cargo test -p vessel thruster_payload`

- [x] 11. Thruster: HTTP Sender + Pre-Signed Buffer + Rate Control

  **What to do**:
  - TDD: Write tests first
  - Create `crates/vessel/src/thruster/sender.rs` — async HTTP sender with reqwest connection pool
  - Define `ThrusterSender` struct holding: `client: reqwest::Client`, `buffer: Arc<PreSignedBuffer>`, `target_url: String`, `tps_target: u32`
  - Implement `ThrusterSender::new(target_url: &str, tps_target: u32, private_key: &[u8; 32], app_id: &str) -> Self`
    - Build reqwest Client with connection pool: `pool_max_idle_per_host(100)`, `pool_idle_timeout(Duration::from_secs(120))`
  - Implement `ThrusterSender::run(&self, duration: Duration) -> ThrusterStats`
    - Spawn N tokio tasks (based on `tps_target`) each sending pre-signed payloads
    - Rate-limit to target TPS using `tokio::time::interval`
    - Track: requests_sent, errors, latency_p50, latency_p99, actual_tps
    - Return `ThrusterStats` struct
  - Define `ThrusterStats` struct: `requests_sent: u64`, `errors: u64`, `latency_p50: Duration`, `latency_p99: Duration`, `actual_tps: f64`, `duration: Duration`
  - Write tests against a local mock HTTP server (wiremock or mockito) — verify 1K+ TPS is achievable
  - Add `crates/vessel/benches/thruster_throughput.rs` — criterion benchmark

  **Must NOT do**:
  - Call Discord's real API
  - Use `unwrap()`/`expect()` outside test code
  - Create an unbounded pre-signed buffer (use bounded ring buffer from Task 10)
  - Block the async runtime (all HTTP is async via reqwest)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: High-concurrency HTTP client with rate limiting and throughput tracking requires careful async design
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 10)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 13
  - **Blocked By**: Task 10 (payload + signing)

  **References** (CRITICAL — Be Exhaustive):
  - `crates/stats-scraper/src/fetch.rs` — Reference for reqwest Client configuration (user_agent, timeout, pool settings) and retry logic
  - `crates/vessel/src/thruster/payload.rs` — `InteractionPayload` and `SignedRequest` from Task 10
  - `crates/vessel/src/thruster/signer.rs` — `PreSignedBuffer` from Task 10
  - `reqwest` crate documentation — Client builder, connection pool settings, async POST API
  - `criterion` crate documentation — Benchmark setup and measurement

  **Why Each Reference Matters**:
  - `fetch.rs`: Shows proven reqwest Client configuration in this project — mirror the pool settings (idle timeout, max connections per host, timeouts)
  - `payload.rs` + `signer.rs`: The types the sender consumes. Must match the `SignedRequest` struct.
  - `reqwest`: Must use async POST with connection pooling for sustained 1K+ TPS. No blocking HTTP.
  - `criterion`: Required for proving 1K+ TPS benchmark.

  **Acceptance Criteria**:
  - [ ] Test file: `crates/vessel/src/thruster/sender.rs` with tests
  - [ ] `cargo test -p vessel thruster_sender` → PASS
  - [ ] Benchmark file: `crates/vessel/benches/thruster_throughput.rs`
  - [ ] `cargo bench -p vessel -- thruster` → shows throughput metrics

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Sustained 1,000+ TPS against local mock server
    Tool: Bash
    Preconditions: sender.rs implemented, mock HTTP server running
    Steps:
      1. Start a local HTTP server that accepts POST and responds 200
      2. Create ThrusterSender with target_url=localhost, tps_target=1000, duration=10s
      3. Run `cargo bench -p vessel -- thruster 2>&1`
      4. Verify: actual_tps >= 950 (allowing 5% overhead)
      5. Verify: errors / requests_sent < 0.01 (under 1% error rate)
    Expected Result: Sustained ≥1,000 TPS with <1% error rate over 10 seconds
    Failure Indicators: TPS below 950, error rate above 1%, connection pool exhaustion
    Evidence: .sisyphus/evidence/task-11-throughput-bench.txt

  Scenario: Pre-signed buffer does not cause memory overflow
    Tool: Bash
    Preconditions: sender.rs implemented
    Steps:
      1. Create PreSignedBuffer with capacity=10,000
      2. Send 100,000 requests using buffer
      3. Monitor memory usage via /proc/self/status or similar
      4. Verify: memory does not grow unboundedly
    Expected Result: Memory stays bounded, buffer rotates correctly
    Failure Indicators: Memory grows linearly with requests, or OOM
    Evidence: .sisyphus/evidence/task-11-memory-check.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(vessel): implement Thruster HTTP sender with pre-signed buffer`
  - Files: `crates/vessel/src/thruster/sender.rs`, `crates/vessel/benches/thruster_throughput.rs`
  - Pre-commit: `cargo test -p vessel thruster_sender`

- [x] 12. Siphon DB Pipeline: Hull → Worker → Diesel Inserts

  **What to do**:
  - TDD: Write tests first
  - Create `crates/vessel/src/siphon/db_writer.rs` — Diesel repository for Siphon's DB writes
  - Define `SiphonDbWriter` struct holding: `conn: &mut AsyncPgConnection` (borrowed from VesselSession)
  - Implement `SiphonDbWriter::insert_player(&mut self, player: NewPlayer) -> Result<Player>`
    - Use `diesel::insert_into(players::table).values(&player).returning(Player::as_returning).get_result(conn).await`
    - Handle duplicate key errors gracefully (ON CONlict DO NOTHING or check-and-insert)
  - Implement `SiphonDbWriter::insert_stat_snapshot(&mut self, snapshot: NewPlayerStatSnapshot) -> Result<PlayerStatSnapshot>`
  - Implement `SiphonDbWriter::insert_external_match_history(&mut self, entry: NewExternalMatchHistoryEntry) -> Result<ExternalMatchHistoryEntry>`
  - Implement `SiphonDbWriter::insert_discord_identity(&mut self, identity: NewDiscordIdentity) -> Result<DiscordIdentity>`
  - Wire SiphonWorker to use SiphonDbWriter after bloom check passes:
    1. Hull::check_or_insert(uid) → false (new UID)
    2. Fetch stats via StatsClient
    3. SiphonDbWriter::insert_player(NewPlayer { ... })
    4. SiphonDbWriter::insert_stat_snapshot(...)
    5. SiphonDbWriter::insert_discord_identity(if applicable)
    6. Send discovered UIDs back to channel
  - Write tests: insert player, insert snapshot, duplicate key handling, transaction rollback verification

  **Must NOT do**:
  - Use `unwrap()`/`expect()` outside test code
  - Commit the transaction (that's VesselSession::complete()'s job)
  - Use `ON CONFLICT DO UPDATE` — use `ON CONFLICT DO NOTHING` or check-first pattern
  - Modify existing Parley schema or model types — use them as-is, import from `crate::db::models`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Diesel async writes within a transaction with proper error handling requires careful async code
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 7, 8, 9)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 7 (session manager), 8 (worker pool), 9 (parser)

  **References** (CRITICAL — Be Exhaustive):
  - `src/db/models.rs` — `NewPlayer`, `NewPlayerStatSnapshot`, `NewExternalMatchHistoryEntry`, `NewDiscordIdentity` structs — import and use these directly
  - `src/db/schema.rs` — `players`, `player_stat_snapshots`, `external_match_history`, `discord_identities` table definitions — import for `insert_into()` calls
  - `src/db/repos.rs` — Reference for how the main codebase does Diesel operations (async `get_result`, `get_results`, `first` patterns)
  - `src/db/pool.rs` — `DbPool` type alias — Vessel creates its own but uses the same type
  - `src/db/mod.rs` — `Game` enum import path: `crate::db::Game`

  **Why Each Reference Matters**:
  - `models.rs`: Must use the EXACT same `NewPlayer`, `NewPlayerStatSnapshot`, etc. structs. Do not redefine them in Vessel.
  - `schema.rs`: Must import `players`, `player_stat_snapshots` etc. table definitions for `insert_into()` calls.
  - `repos.rs`: Shows the established Diesel async patterns in this project. Follow them exactly.
  - `pool.rs`: Vessel needs its own pool but uses the same `DbPool = Pool<AsyncPgConnection>` type.
  - `mod.rs`: `Game::R6` is the only variant used in V1.

  **Acceptance Criteria**:
  - [ ] Test file: `crates/vessel/src/siphon/db_writer.rs` with tests
  - [ ] `cargo test -p vessel siphon_db_writer` → PASS
  - [ ] Player insert succeeds within transaction
  - [ ] Duplicate player insert returns clear error (not panic)
  - [ ] All inserts execute within the VesselSession transaction (verifiable by purging)

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Insert player and verify within transaction, then purge removes it
    Tool: Bash
    Preconditions: Running Postgres, session manager, db_writer.rs implemented
    Steps:
      1. Start a VesselSession
      2. Insert a player via SiphonDbWriter
      3. Query the player within the same transaction — assert exists
      4. Call session.purge()
      5. Query the player — assert does NOT exist
    Expected Result: Player visible during session, absent after purge
    Failure Indicators: Player not found during session, or still exists after purge
    Evidence: .sisyphus/evidence/task-12-insert-purge.txt

  Scenario: Duplicate player insert handled gracefully
    Tool: Bash
    Preconditions: db_writer.rs implemented
    Steps:
      1. Start a VesselSession
      2. Insert player "test_player" — succeeds
      3. Insert player "test_player" again — returns clear error, not panic
      4. Verify: no crash, error message indicates duplicate
    Expected Result: Duplicate insert fails with clear error, Siphon continues crawling
    Failure Indicators: Panic, crash, or silent data corruption
    Evidence: .sisyphus/evidence/task-12-duplicate-handling.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(vessel): implement Siphon DB pipeline with Diesel writes`
  - Files: `crates/vessel/src/siphon/db_writer.rs`
  - Pre-commit: `cargo test -p vessel siphon_db_writer`

- [x] 13. Thruster End-to-End: Sign → HTTP → Metrics Pipeline

  **What to do**:
  - TDD: Write tests first
  - Create `crates/vessel/src/thruster/mod.rs` — top-level orchestrator (update existing stub)
  - Define `ThrusterOrchestrator` struct: `sender: ThrusterSender`, `config: ThrusterConfig`, `stats: Arc<Mutex<ThrusterStats>>`
  - Define `ThrusterConfig` struct: `target_url: String`, `app_id: String`, `private_key: [u8; 32]`, `tps: u32`, `duration: Duration`, `interaction_types: Vec<InteractionType>`
  - Implement `ThrusterOrchestrator::run(&self, progress: ProgressBar) -> ThrusterStats`
    1. Build `InteractionPayload` for each type
    2. Create `PreSignedBuffer` with capacity
    3. Spawn sender tasks with rate limiting
    4. Aggregate stats (TPS, latency, errors)
    5. Report to indicatif progress bar
    6. Return final `ThrusterStats`
  - Implement graceful shutdown: SIGTERM/SIGINT handler cancels all sender tasks
  - Write end-to-end test: build payload → sign → send to mock server → verify signature → collect stats
  - Write benchmark: `criterion` throughput test proving ≥1,000 TPS

  **Must NOT do**:
  - Call Discord's real API
  - Use `unwrap()`/`expect()` outside test code
  - Create an orchestrator that's coupled to CLI (keep it library-usable)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: End-to-end wiring of signing, HTTP, and metrics collection with async orchestration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 10, 11)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 10 (payload + signing), 11 (sender)

  **References** (CRITICAL — Be Exhaustive):
  - `crates/vessel/src/thruster/payload.rs` — `InteractionPayload` and builder from Task 10
  - `crates/vessel/src/thruster/signer.rs` — `PreSignedBuffer` and `SignedRequest` from Task 10
  - `crates/vessel/src/thruster/sender.rs` — `ThrusterSender` and `ThrusterStats` from Task 11
  - `crates/vessel/src/cli.rs` — `ThrusterArgs` from Task 5

  **Why Each Reference Matters**:
  - `payload.rs` + `signer.rs`: The types the orchestrator consumes and wires together.
  - `sender.rs`: The HTTP sender that the orchestrator calls. Must pass `ThrusterStats` up through the orchestrator.
  - `cli.rs`: The CLI args that the orchestrator receives (target_url, app_id, private_key, tps, duration).

  **Acceptance Criteria**:
  - [ ] Test file: `crates/vessel/src/thruster/mod.rs` with integration tests
  - [ ] `cargo test -p vessel thruster_e2e` → PASS
  - [ ] `cargo bench -p vessel -- thruster` → ≥1,000 TPS sustained
  - [ ] SIGTERM gracefully stops all sender tasks

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: End-to-end sign and send to mock server
    Tool: Bash
    Preconditions: Thruster orchestrator implemented, mock server running
    Steps:
      1. Start a local HTTP server on localhost:PORT that verifies Ed25519 signatures
      2. Create ThrusterOrchestrator with --target-url localhost:PORT
      3. Run for 5 seconds at 100 TPS
      4. Verify: mock server received ~500 requests, all with valid signatures
      5. Verify: ThrusterStats shows correct request count
    Expected Result: All requests have valid Ed25519 signatures, server verified each one
    Failure Indicators: Signature verification failures, wrong request count, connection errors
    Evidence: .sisyphus/evidence/task-13-e2e-sign-send.txt

  Scenario: Graceful shutdown on SIGTERM
    Tool: Bash
    Preconditions: Thruster running sustained load
    Steps:
      1. Start Thruster with duration=60s
      2. Send SIGTERM after 3 seconds
      3. Verify: Thruster stops within 2 seconds, returns partial ThrusterStats
      4. Verify: No orphaned HTTP connections
    Expected Result: Clean shutdown with partial stats, no hanging tasks
    Failure Indicators: Process hangs, panic, or incomplete stats
    Evidence: .sisyphus/evidence/task-13-graceful-shutdown.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(vessel): implement Thruster end-to-end pipeline with metrics`
  - Files: `crates/vessel/src/thruster/mod.rs`, `crates/vessel/benches/thruster_throughput.rs` (update)
  - Pre-commit: `cargo test -p vessel thruster_e2e && cargo bench -p vessel -- thruster`

- [x] 14. Purge: Transaction Rollback + Bloom Cleanup + Advisory Lock

  **What to do**:
  - TDD: Write tests first
  - Implement `PurgeCommand` in `crates/vessel/src/purge.rs`
  - `PurgeCommand::run(session: VesselSession, bloom_path: &Path) -> Result<()>`
    1. Call `session.purge()` — ROLLBACK the Postgres transaction, delete all session DB writes
    2. Delete the bloom cache file at `bloom_path` (if it exists)
    3. Log: "Session {session_id} purged. All DB writes rolled back. Bloom cache deleted."
    4. If bloom file doesn't exist: log warning, don't error
    5. Release the advisory lock (already handled by session.purge())
  - Handle edge cases:
    - Session already purged → error: "session already purged"
    - Session already completed → error: "session already completed, cannot purge"
    - Bloom file corrupted or missing → log warning, continue
  - Write tests: purge removes all data, double-purge fails, completed-session purge fails

  **Must NOT do**:
  - Use TRUNCATE on any table
  - Delete bloom file if session purge fails (only delete on successful rollback)
  - Allow purging another session's data

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward implementation leveraging the session manager from Task 7
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 7)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 15
  - **Blocked By**: Task 7 (session manager)

  **References** (CRITICAL — Be Exhaustive):
  - `crates/vessel/src/session.rs` — `VesselSession::purge()` method from Task 7
  - `crates/vessel/src/hull.rs` — `Hull::save()` and `Hull::load()` paths — bloom cache file location

  **Why Each Reference Matters**:
  - `session.rs`: `purge()` does the ROLLBACK and advisory lock release. PurgeCommand calls this.
  - `hull.rs`: The bloom cache file path must match what Hull uses for `save()` and `load()`. Delete this same file.

  **Acceptance Criteria**:
  - [ ] Test file: `crates/vessel/src/purge.rs` with tests
  - [ ] `cargo test -p vessel purge` → PASS
  - [ ] Purge removes all session DB writes
  - [ ] Purge deletes bloom cache file
  - [ ] Double-purge returns clear error
  - [ ] Purging a completed session returns clear error

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Purge removes all session data and bloom cache
    Tool: Bash
    Preconditions: Active VesselSession with inserted data
    Steps:
      1. Start session, insert 5 player rows
      2. Save Hull bloom cache to file
      3. Call PurgeCommand::run(session, bloom_path)
      4. Query players table — assert 0 rows from this session
      5. Check bloom_path — assert file does not exist
    Expected Result: All DB rows gone, bloom file deleted
    Failure Indicators: Rows still exist, bloom file still present, or errors
    Evidence: .sisyphus/evidence/task-14-purge-success.txt

  Scenario: Purging already-purged session fails gracefully
    Tool: Bash
    Preconditions: Already-purged session
    Steps:
      1. Start session and purge it
      2. Attempt to purge the same session again
      3. Verify: returns Error "session already purged"
    Expected Result: Clear error message, no crash
    Failure Indicators: Panic, double rollback attempt, or silent success
    Evidence: .sisyphus/evidence/task-14-double-purge.txt

  Scenario: Purging completed session fails gracefully
    Tool: Bash
    Preconditions: Completed (committed) session
    Steps:
      1. Start session, insert data, call session.complete()
      2. Attempt to purge the completed session
      3. Verify: returns Error "session already completed"
    Expected Result: Clear error message, committed data remains intact
    Failure Indicators: Data deleted despite being committed, or panic
    Evidence: .sisyphus/evidence/task-14-completed-purge.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(vessel): implement Purge command with transaction rollback and bloom cleanup`
  - Files: `crates/vessel/src/purge.rs`
  - Pre-commit: `cargo test -p vessel purge`

- [x] 15. CLI Progress Bars + Session Orchestration

  **What to do**:
  - Create `crates/vessel/src/progress.rs` — indicatif multi-progress display
  - Define `VesselProgress` struct with three progress bars:
    - "Discovery Rate" — players discovered per second
    - "DB Write Latency" — average ms per DB write
    - "Active Syncs" — current number of active HTTP requests (Siphon) or active sends (Thruster)
  - Use `indicatif::MultiProgress` with `ProgressBar::new_spinner()` style for live-updating stats
  - Create `crates/vessel/examples/siphon.rs` — complete example binary
    - Parse CLI args via `cli.rs`
    - Create `VesselSession` (begin transaction)
    - Load or create `Hull` (bloom filter)
    - Start Siphon workers
    - Display progress bars
    - On completion: `session.complete()` or `session.purge()` based on user input
  - Create `crates/vessel/examples/thruster.rs` — complete example binary
    - Parse CLI args via `cli.rs`
    - Create `ThrusterOrchestrator`
    - Run with progress bars
    - Display final stats
  - Create `crates/vessel/examples/purge.rs` — complete example binary
    - Parse CLI args via `cli.rs`
    - Run `PurgeCommand`
    - Display confirmation
  - Write end-to-end smoke test: run siphon example with `--seed-player` against mock server

  **Must NOT do**:
  - Use `crossterm` or `ratatui` for TUI — indicatif only
  - Hardcode database URLs — use `--database-url` flag or `DATABASE_URL` env var
  - Use ASCII art divider comments (`// ======`, `// -------`) per AGENTS.md

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Wiring existing modules together with CLI arg parsing and progress bars
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 5, 12, 13, 14)
  - **Parallel Group**: Wave 3 (last task in wave)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5 (CLI), 12 (Siphon DB), 13 (Thruster), 14 (Purge)

  **References** (CRITICAL — Be Exhaustive):
  - `crates/vessel/src/cli.rs` — `VesselCli`, `SiphonArgs`, `ThrusterArgs`, `PurgeArgs` from Task 5
  - `crates/vessel/src/session.rs` — `VesselSession::start()`, `complete()`, `purge()` from Task 7
  - `crates/vessel/src/hull.rs` — `Hull` from Task 2
  - `crates/vessel/src/siphon/worker.rs` — `Siphon::spawn_workers()`, `Siphon::drain_results()` from Task 8
  - `crates/vessel/src/thruster/mod.rs` — `ThrusterOrchestrator::run()` from Task 13
  - `crates/vessel/src/purge.rs` — `PurgeCommand::run()` from Task 14
  - `indicatif` crate docs — `MultiProgress`, `ProgressBar::new_spinner()`, `set_style()`, `finish()`

  **Why Each Reference Matters**:
  - `cli.rs`: The parsed args that drive all example binaries.
  - `session.rs`, `hull.rs`, `worker.rs`, `thruster/mod.rs`, `purge.rs`: These are the modules being wired together. Example binaries are thin wrappers calling these library APIs.
  - `indicatif`: Must use `MultiProgress` for synchronized multi-line progress display. Style should be minimal SaaS-like (no ASCII art).

  **Acceptance Criteria**:
  - [ ] `crates/vessel/examples/siphon.rs` compiles and runs
  - [ ] `crates/vessel/examples/thruster.rs` compiles and runs
  - [ ] `crates/vessel/examples/purge.rs` compiles and runs
  - [ ] Progress bars display "Discovery Rate", "DB Write Latency", "Active Syncs"
  - [ ] `cargo run -p vessel --example siphon -- --help` shows arg descriptions

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Siphon example binary starts and displays progress
    Tool: interactive_bash (tmux)
    Preconditions: Running Postgres, compiled siphon example
    Steps:
      1. Run `cargo run -p vessel --example siphon -- --seed-player "test-uid" --platform pc --database-url <url>`
      2. Verify: terminal shows three progress indicators (Discovery Rate, DB Write Latency, Active Syncs)
      3. Verify: no panic, no crash after 5 seconds
      4. Send SIGTERM (Ctrl+C)
      5. Verify: process exits cleanly within 3 seconds
    Expected Result: Progress bars visible, process runs without crash, clean exit on SIGTERM
    Failure Indicators: Panic, crash, missing progress indicators, hanging on exit
    Evidence: .sisyphus/evidence/task-15-siphon-cli.txt

  Scenario: CLI help output is informative
    Tool: Bash
    Preconditions: CLI implemented
    Steps:
      1. Run `cargo run -p vessel --example siphon -- --help`
      2. Verify: output shows --seed-player, --platform, --max-depth, --bloom-fp-rate flags
      3. Run `cargo run -p vessel --example thruster -- --help`
      4. Verify: output shows --app-id, --private-key, --target-url, --tps, --duration flags
      5. Run `cargo run -p vessel --example purge -- --help`
      6. Verify: output shows --session-id, --bloom-cache-path flags
    Expected Result: All subcommands show complete help with descriptions
    Failure Indicators: Missing flags, unclear descriptions, or panic
    Evidence: .sisyphus/evidence/task-15-cli-help.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(vessel): add CLI progress bars and example binaries`
  - Files: `crates/vessel/src/progress.rs`, `crates/vessel/examples/siphon.rs`, `crates/vessel/examples/thruster.rs`, `crates/vessel/examples/purge.rs`
  - Pre-commit: `cargo build -p vessel --examples`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback → fix → re-run → present again → wait for okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo clippy -p vessel -- -D warnings` + `cargo fmt -p vessel --check` + `cargo test -p vessel`. Review all changed files for: `unwrap()`/`expect()` outside test code, empty catches, `println!` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify no ASCII divider comments.
  Output: `Build [PASS/FAIL] | Clippy [PASS/FAIL] | Fmt [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: Siphon crawl → Hull dedup → DB write → Purge rollback. Test Thruster signing compat. Test edge cases: empty bloom file, wrong Ed25519 key format, bounded channel full, advisory lock contention. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT Have" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes. Ensure no `crates/vessel/` code outside what's specified.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(vessel): scaffold crate + foundation modules` — Cargo.toml, lib.rs, hull.rs, session migration, cli.rs, channel types
- **Wave 2**: `feat(vessel): implement siphon, thruster, and session manager` — siphon/, thruster/, session.rs
- **Wave 3**: `feat(vessel): wire integrations + purge + CLI progress` — pipeline wiring, purge, indicatif
- **Final**: `test(vessel): add integration tests + benchmarks` — tests/, benches/

---

## Success Criteria

### Verification Commands
```bash
cargo build -p vessel                    # Expected: Compiles with zero warnings
cargo test -p vessel                     # Expected: All tests pass
cargo clippy -p vessel -- -D warnings    # Expected: Zero warnings
cargo fmt -p vessel --check              # Expected: No formatting changes
cargo bench -p vessel -- thruster        # Expected: ≥1,000 TPS sustained
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass
- [x] Thruster benchmark ≥ 1,000 TPS sustained
- [x] Ed25519 signatures match TypeScript verification
- [x] Bloom filter round-trips through bincode
- [x] Purge ROLLBACK removes all session data
- [x] Advisory lock prevents concurrent instances