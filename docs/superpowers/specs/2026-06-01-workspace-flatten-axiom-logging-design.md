# Workspace Flatten + Axiom Logging — Design Spec

**Date:** 2026-06-01
**Status:** Approved

## Context

The Rust workspace originally had 5 crates (engine, stats-scraper, brawl-stars, vessel, ocr). Four have been deleted from disk, leaving only `crates/stats-scraper` and the `src/` binary crate. The workspace Cargo.toml still references all 5 members, and the binary crate has broken references to deleted crates (engine, brawl-stars). The project needs to be flattened into a single crate, cleaned up, and instrumented with Axiom for structured logging.

## Goals

1. **Flatten workspace into single crate** — merge `crates/stats-scraper` into `src/`, remove workspace structure
2. **Remove dead code** — delete engine handler, Brawl Stars backend, broken proto references, orphaned migrations
3. **Add Axiom logging** — batch and send structured logs for HTTP requests and database queries
4. **Remove Prometheus metrics** — replace with Axiom events
5. **Keep local stdout logging** — tracing-subscriber stays for dev alongside Axiom

## Design

### 1. Directory Structure (After)

```
parley/
├── Cargo.toml              # Single crate, no [workspace]
├── build.rs                # Unified proto compilation
├── diesel.toml
├── migrations/             # Cleaned up (remove vessel_sessions)
├── proto/                  # Cleaned up (remove ocr references)
│   ├── common/v1/types.proto
│   ├── guild/v1/guild.proto
│   ├── identity/v1/identity.proto
│   └── stats/v1/stats.proto
└── src/
    ├── main.rs
    ├── connect.rs
    ├── context.rs
    ├── logging.rs          # NEW: Axiom batching layer
    ├── proto.rs
    ├── schema.rs
    ├── backends/           # from crates/stats-scraper/src/backends/
    │   ├── mod.rs
    │   └── r6.rs
    ├── cache.rs            # from stats-scraper
    ├── cache_store.rs      # from stats-scraper
    ├── fetch.rs            # from stats-scraper
    ├── metrics.rs          # from stats-scraper (KOST calc, NOT Prometheus)
    ├── nuxt.rs             # from stats-scraper
    ├── scrape.rs           # from stats-scraper
    ├── db/
    │   ├── mod.rs
    │   ├── models.rs
    │   ├── pool.rs
    │   ├── repos.rs
    │   ├── schema.rs
    │   └── stats_cache_store.rs
    └── handlers/
        ├── mod.rs
        ├── stats.rs
        ├── identity.rs
        └── guild_settings.rs
```

### 2. Removals

| What | Why |
|------|-----|
| `crates/` directory (entire) | Only stats-scraper remained; merged into src/ |
| `[workspace]` from Cargo.toml | Single crate, no workspace needed |
| `src/handlers/engine.rs` | References deleted engine crate |
| Engine routes in `src/connect.rs` | No engine handler to serve them |
| `src/metrics_setup.rs` | Prometheus replaced by Axiom |
| `metrics` + `metrics-exporter-prometheus` deps | Replaced by Axiom |
| `brawl-stars` dependency | Crate deleted, backend removed |
| `src/backends/brawl_stars.rs` | Module removed, BrawlStarsBackend re-export removed |
| `proto/ocr/v1/ocr.proto` reference in build.rs | File doesn't exist |
| `migrations/*vessel_sessions*` | Orphaned migration for deleted crate |
| `proto/engine/` directory | Engine crate deleted |
| `proto/ocr/` directory (if exists) | OCR crate deleted |
| `crates/stats-scraper/build.rs` | Merged into root build.rs |
| `crates/stats-scraper/Cargo.toml` | Merged into root Cargo.toml |

### 3. Cargo.toml Changes

Remove `[workspace]` section entirely. Merge stats-scraper dependencies into root `[dependencies]`. The root Cargo.toml becomes a single binary crate.

**Dependencies to add:**
- `axiom-rs = "0.11.6"` — official Axiom client
- `tokio` feature `sync` (for batch channel)

**Dependencies to remove:**
- `engine` (path dep, crate deleted)
- `brawl-stars` (path dep, crate deleted)
- `ocr` (path dep, crate deleted)
- `metrics` (replaced by Axiom)
- `metrics-exporter-prometheus` (replaced by Axiom)

**Dependencies to merge from stats-scraper Cargo.toml:**
- `simd-json = "0.17"`
- `regex`, `url`, `thiserror`, `once_cell`, `async-trait` (already in workspace deps, verify)
- `prost`, `prost-types`, `serde`, `serde_json`, `reqwest`, `tracing`, `tokio` (already in workspace deps)

### 4. Proto Compilation (build.rs)

Unify into a single `build.rs` at the root. Compile:
- `proto/common/v1/types.proto`
- `proto/identity/v1/identity.proto`
- `proto/guild/v1/guild.proto`
- `proto/stats/v1/stats.proto`

Remove references to `proto/ocr/v1/ocr.proto` and `proto/engine/v1/engine.proto`.

### 5. Axiom Logging Layer (`src/logging.rs`)

#### Architecture

```
Request/DB operation
       │
       ▼
  tracing::info!(...)  ──────► tracing-subscriber (stdout, local dev)
       │
       ▼
  AxiomLog { ... }
       │
       ▼
  mpsc::channel (batch buffer, capacity 2048)
       │
       ▼
  Batch worker (tokio task)
    - Flushes every 1s OR when batch reaches 100 events
    - Sends to Axiom via axiom-rs ingest endpoint
    - Retries on failure with exponential backoff
    - Drops events if buffer full (backpressure)
```

#### Configuration (env vars)

| Variable | Default | Description |
|----------|---------|-------------|
| `AXIOM_TOKEN` | (required) | Axiom API token |
| `AXIOM_DATASET` | `parley` | Axiom dataset name |
| `AXIOM_ORG_ID` | (optional) | Axiom organization ID |
| `AXIOM_BATCH_SIZE` | `100` | Max events per batch |
| `AXIOM_FLUSH_INTERVAL_MS` | `1000` | Max time between flushes |
| `AXIOM_BUFFER_SIZE` | `2048` | Channel buffer capacity |
| `AXIOM_ENABLED` | `true` | Set to `false` to disable Axiom |

#### Event Schema

**HTTP Request log:**
```json
{
  "event": "http_request",
  "method": "GET",
  "path": "/stats/username",
  "status": 200,
  "duration_ms": 42.5,
  "user_agent": "...",
  "content_type": "application/json",
  "timestamp": "2026-06-01T12:00:00Z"
}
```

**Database query log:**
```json
{
  "event": "db_query",
  "operation": "select",
  "table": "players",
  "duration_ms": 3.2,
  "error": null,
  "timestamp": "2026-06-01T12:00:00Z"
}
```

**Cache event log:**
```json
{
  "event": "cache",
  "action": "hit|miss|stale_serve",
  "game": "r6",
  "username_hash": "sha256:abc123",
  "timestamp": "2026-06-01T12:00:00Z"
}
```

#### Implementation

`AxiomLayer` — a struct that holds an `mpsc::Sender<AxiomEvent>`. It spawns a background task that:
1. Receives events from the channel
2. Accumulates into a `Vec<AxiomEvent>`
3. Flushes when batch is full or interval elapses (using `tokio::select!` with `tokio::time::interval`)
4. Sends to Axiom via `axiom_rs::Client::ingest()`
5. On failure, logs warning to tracing and drops the batch (no infinite retry)

`AxiomLayer` is stored in `AppContext` and passed to handlers that need it.

#### HTTP Request Logging

Use a Tower middleware (`AxiomLogLayer`) that wraps each request, records start time, and logs on response. This is the cleanest approach — it hooks into the Axum service stack without modifying individual handlers.

#### Database Query Logging

Add a thin wrapper around `DbPool` or instrument the repository methods. The simplest approach: add an `axiom: Option<Arc<AxiomLayer>>` field to `PostgresStatsCacheStore` and the identity/guild handlers, and log queries at the repository level. For a lighter touch, instrument the pool's `get()` and the cache store's `fetch()` method — these are the two main DB interaction points.

### 6. Handler Changes

- **Remove `src/handlers/engine.rs`** — entire file
- **Remove engine routes from `src/connect.rs`** — the 3 ConnectRPC endpoints and their imports
- **Remove `src/metrics_setup.rs`** — entire file
- **Update `src/handlers/stats.rs`** — remove Prometheus counter calls, add Axiom cache event logging
- **Update `src/db/stats_cache_store.rs`** — replace `metrics::counter!` calls with Axiom events
- **Update `src/context.rs`** — remove Prometheus handle, remove engine handler, remove BrawlStars references, add Axiom layer
- **Update `src/main.rs`** — remove metrics_setup, add Axiom initialization

### 7. Migration Cleanup

Remove the `2026-05-14-200000_vessel_sessions` migration directory. The `vessel` crate is deleted and this table is orphaned.

## Verification

1. `cargo build` compiles without errors
2. `cargo test` passes all tests
3. `cargo clippy` passes without warnings
4. `cargo fmt --check` passes
5. Verify Axiom events appear in the Axiom dashboard when running locally with `AXIOM_TOKEN` set
6. Verify stdout logging still works via `RUST_LOG=info cargo run`
7. Verify all proto files compile correctly (no missing imports)
