# Axiom Logging Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing axiom-rs integration to log request origins, database operations, and errors, while fixing client construction and adding graceful shutdown.

**Architecture:** The existing `logging.rs` already has the core batching infrastructure (mpsc channel → background worker → flush on interval/threshold). This plan adds missing log fields, integrates DB operation logging into repos, and adds error event logging in handlers.

**Tech Stack:** Rust, axiom-rs 0.11.6, tokio, axum, tower

---

## Current State Analysis

The existing `logging.rs` (328 lines) already implements:
- `AxiomEvent` enum (Http, Db, Cache variants)
- `AxiomConfig` with env var support (AXIOM_TOKEN, AXIOM_DATASET, AXIOM_BATCH_SIZE, AXIOM_FLUSH_MS, etc.)
- `AxiomLogger` with background batch worker (mpsc → tokio::select! loop → flush on interval or threshold)
- `AxiomLogLayer` / `AxiomLogService` Tower middleware for HTTP request logging
- HTTP events log: method, path, status, duration_ms, user_agent, content_type

**Gaps to fix:**
1. Client construction uses `Client::new()` (env fallback) instead of builder with parsed config token
2. HTTP middleware doesn't log request origin (client IP)
3. `AxiomEvent` has no `Error` variant for handler-level error logging
4. DB repos never call `log_db()` — the method exists but is unused
5. No graceful shutdown — background worker may drop logs on process exit
6. `flush_batch` discards `IngestStatus` — no observability into batch success

---

### Task 1: Fix axiom client construction to use builder with config token

**Files:**
- Modify: `src/logging.rs:107-119`

The current code creates the axiom client with `Client::new()` which reads `AXIOM_TOKEN` from env. This works but is fragile — if the token is passed programmatically (e.g., tests), it won't be used. Use the builder instead.

- [ ] **Step 1: Replace client construction in `AxiomLogger::new`**

Replace the client creation block in `logging.rs`:

```rust
// Before (line 117-119):
let client = axiom_rs::Client::new()
    .expect("axiom client builds");
let client = Arc::new(client);

// After:
let mut builder = axiom_rs::Client::builder()
    .with_token(&token);
if let Some(ref org) = org_id {
    builder = builder.with_org_id(org);
}
let client = Arc::new(builder.build().expect("axiom client builds"));
```

- [ ] **Step 2: Run `cargo build` to verify compilation**

Expected: compiles cleanly

- [ ] **Step 3: Run `cargo clippy -- -D warnings`**

Expected: no warnings

---

### Task 2: Add `Error` variant to `AxiomEvent` and `log_error` helper

**Files:**
- Modify: `src/logging.rs:22-47` (AxiomEvent enum)
- Modify: `src/logging.rs:165-210` (log methods)

- [ ] **Step 1: Add `Error` variant to `AxiomEvent`**

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event")]
pub enum AxiomEvent {
    Http {
        method: String,
        path: String,
        status: u16,
        duration_ms: f64,
        user_agent: Option<String>,
        content_type: Option<String>,
    },
    Db {
        operation: String,
        table: String,
        duration_ms: f64,
        error: Option<String>,
    },
    Cache {
        action: String,
        game: String,
        username_hash: Option<String>,
    },
    Error {
        service: String,
        code: String,
        message: String,
        path: Option<String>,
    },
}
```

- [ ] **Step 2: Add `log_error` method to `AxiomLogger`**

```rust
pub fn log_error(&self, service: &str, code: &str, message: &str, path: Option<String>) {
    self.log(AxiomEvent::Error {
        service: service.to_string(),
        code: code.to_string(),
        message: message.to_string(),
        path,
    });
}
```

- [ ] **Step 3: Run `cargo build` and `cargo clippy -- -D warnings`**

---

### Task 3: Add request origin (client IP) to HTTP logging

**Files:**
- Modify: `src/logging.rs:26-33` (Http variant)
- Modify: `src/logging.rs:174-191` (log_http method)
- Modify: `src/logging.rs:296-327` (AxiomLogService::call)

- [ ] **Step 1: Add `origin` field to `AxiomEvent::Http`**

```rust
Http {
    method: String,
    path: String,
    status: u16,
    duration_ms: f64,
    user_agent: Option<String>,
    content_type: Option<String>,
    origin: Option<String>,
},
```

- [ ] **Step 2: Update `log_http` to accept origin**

```rust
pub fn log_http(
    &self,
    method: &str,
    path: &str,
    status: u16,
    duration_ms: f64,
    user_agent: Option<String>,
    content_type: Option<String>,
    origin: Option<String>,
) {
    self.log(AxiomEvent::Http {
        method: method.to_string(),
        path: path.to_string(),
        status,
        duration_ms,
        user_agent,
        content_type,
        origin,
    });
}
```

- [ ] **Step 3: Extract client IP in middleware and pass to log_http**

In `AxiomLogService::call`, extract the origin from common proxy headers (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`) and the socket peer addr:

```rust
fn call(&mut self, req: Request) -> Self::Future {
    let logger = self.logger.clone();
    let start = Instant::now();

    // Extract origin before moving req
    let origin = extract_origin(&req);

    let clone = self.inner.clone();
    let mut inner = std::mem::replace(&mut self.inner, clone);

    Box::pin(async move {
        let method = req.method().to_string();
        let path = req.uri().path().to_string();
        let user_agent = req
            .headers()
            .get(HeaderName::from_static("user-agent"))
            .and_then(|v| v.to_str().ok())
            .map(String::from);

        let response = inner.call(req).await?;

        let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
        let status = response.status().as_u16();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(String::from);

        logger.log_http(&method, &path, status, duration_ms, user_agent, content_type, origin);

        Ok(response)
    })
}
```

- [ ] **Step 4: Add `extract_origin` helper function**

Add this near the top of the middleware section (after imports):

```rust
fn extract_origin(req: &Request) -> Option<String> {
    // Check proxy headers first (Cloudflare, load balancers)
    if let Some(v) = req.headers().get("cf-connecting-ip") {
        if let Ok(s) = v.to_str() {
            return Some(s.to_string());
        }
    }
    if let Some(v) = req.headers().get("x-forwarded-for") {
        if let Ok(s) = v.to_str() {
            // Take the first IP in the chain
            return Some(s.split(',').next()?.trim().to_string());
        }
    }
    if let Some(v) = req.headers().get("x-real-ip") {
        if let Ok(s) = v.to_str() {
            return Some(s.to_string());
        }
    }
    // Fall back to socket peer address (works in local dev)
    req.extensions()
        .get::<axum::extract::ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip().to_string())
}
```

- [ ] **Step 5: Run `cargo build` and `cargo clippy -- -D warnings`**

---

### Task 4: Add DB operation logging to repos

**Files:**
- Modify: `src/db/stats_cache_store.rs`

The repos currently don't log to Axiom. Since repos don't have access to `AxiomLogger` (they only take `&mut AsyncPgConnection`), we log DB operations at the call sites in `stats_cache_store.rs`.

**Approach:** Wrap each DB call with timing + axiom logging in `PostgresStatsCacheStore`.

- [ ] **Step 1: Add timing + logging to `upsert_player`**

```rust
async fn upsert_player(
    &self,
    game: Game,
    username: &str,
    platform: StatsPlatform,
) -> Result<i32, StatsFetchError> {
    let start = std::time::Instant::now();
    let mut conn = self.conn().await?;
    let result = PlayerRepo::upsert_by_identity(
        &mut conn,
        to_db_game(game),
        username,
        platform.as_str(),
        None,
        None,
    )
    .await;
    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
    let error = result.as_ref().err().map(|e| e.to_string());
    self.axiom.log_db("upsert", "players", duration_ms, error);
    result.map(|p| p.id).map_err(map_diesel)
}
```

- [ ] **Step 2: Add timing + logging to `read_snapshot_within`**

```rust
async fn read_snapshot_within(
    &self,
    game: Game,
    player_id: i32,
    max_age_ms: i64,
) -> Result<Option<ScrapedStats>, StatsFetchError> {
    let start = std::time::Instant::now();
    let mut conn = self.conn().await?;
    let row = PlayerStatSnapshotRepo::latest_fresh(
        &mut conn,
        to_db_game(game),
        player_id,
        now_ms(),
        max_age_ms,
    )
    .await;
    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
    let error = row.as_ref().err().map(|e| e.to_string());
    self.axiom.log_db("select", "player_stat_snapshots", duration_ms, error);
    row.map(|r| serde_json::from_str::<ScrapedStats>(&r.payload_json).ok()).map_err(map_diesel)
}
```

- [ ] **Step 3: Add timing + logging to `write_snapshot`**

```rust
async fn write_snapshot(
    &self,
    game: Game,
    player_id: i32,
    stats: &ScrapedStats,
) -> Result<(), StatsFetchError> {
    // ... serialize payload_json as before ...
    let start = std::time::Instant::now();
    let mut conn = self.conn().await?;
    let result = PlayerStatSnapshotRepo::insert(&mut conn, new_row).await;
    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
    let error = result.as_ref().err().map(|e| e.to_string());
    self.axiom.log_db("insert", "player_stat_snapshots", duration_ms, error);
    result.map(|_| ()).map_err(map_diesel)
}
```

- [ ] **Step 4: Run `cargo build` and `cargo clippy -- -D warnings`**

---

### Task 5: Add error logging in handlers

**Files:**
- Modify: `src/handlers/identity.rs`
- Modify: `src/handlers/guild_settings.rs`
- Modify: `src/handlers/stats.rs`

Handlers currently return error responses but don't log them to Axiom. Add `ctx.axiom.log_error(...)` calls at error return sites.

- [ ] **Step 1: Add error logging to `identity.rs` handlers**

In each handler, at every `return encode_ok(...)` with `success: false`, add an axiom error log before the return. For example in `link_account_rpc`:

```rust
// Before:
Err(e) => {
    return encode_ok(
        &LinkAccountResponse {
            success: false,
            error: Some(err("Internal", format!("db pool: {e}"))),
            ..Default::default()
        },
        enc,
    );
}

// After:
Err(e) => {
    let msg = format!("db pool: {e}");
    ctx.axiom.log_error("identity.link_account", "Internal", &msg, Some("/parley.identity.v1.IdentityService/LinkAccount".into()));
    return encode_ok(
        &LinkAccountResponse {
            success: false,
            error: Some(err("Internal", msg)),
            ..Default::default()
        },
        enc,
    );
}
```

Apply this pattern to all error paths in `link_account_rpc`, `unlink_account_rpc`, `lookup_by_discord_rpc`, `lookup_by_username_rpc`.

- [ ] **Step 2: Add error logging to `guild_settings.rs` handlers**

Same pattern for all guild settings handlers (8 functions total).

- [ ] **Step 3: Add error logging to `stats.rs` handler**

In `stats_get`, log fetch errors:

```rust
Err(err) => {
    ctx.axiom.log_error("stats.fetch", &format!("{:?}", err.kind), &err.message, Some(format!("/stats/{username}")));
    map_error(err).into_response()
}
```

- [ ] **Step 4: Run `cargo build` and `cargo clippy -- -D warnings`**

---

### Task 6: Add graceful shutdown to background worker

**Files:**
- Modify: `src/logging.rs:94-163` (AxiomLogger)
- Modify: `src/main.rs`

The background worker currently runs as a fire-and-forget `tokio::spawn`. On shutdown, pending logs in the batch may be lost. Add a shutdown signal.

- [ ] **Step 1: Add a shutdown signal to the worker**

Change `AxiomLogger` to hold a `tokio::sync::watch::Sender<()>` for shutdown signaling:

```rust
pub struct AxiomLogger {
    tx: Option<mpsc::Sender<AxiomEvent>>,
    shutdown: Option<tokio::sync::watch::Sender<()>>,
}
```

In `AxiomLogger::new`, create the shutdown sender and pass the receiver to the worker:

```rust
let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(());

tokio::spawn(async move {
    let client = /* ... */;
    let mut batch = Vec::with_capacity(batch_size);
    let mut interval = tokio::time::interval(flush_interval);

    loop {
        tokio::select! {
            _ = interval.tick() => {
                if !batch.is_empty() {
                    Self::flush_batch(&client, &dataset, &mut batch).await;
                }
            }
            event = rx.recv() => {
                match event {
                    Some(e) => {
                        batch.push(e);
                        if batch.len() >= batch_size {
                            Self::flush_batch(&client, &dataset, &mut batch).await;
                        }
                    }
                    None => {
                        if !batch.is_empty() {
                            Self::flush_batch(&client, &dataset, &mut batch).await;
                        }
                        tracing::info!("axiom logging worker shutdown (channel closed)");
                        break;
                    }
                }
            }
            _ = shutdown_rx.changed() => {
                if !batch.is_empty() {
                    Self::flush_batch(&client, &dataset, &mut batch).await;
                }
                tracing::info!("axiom logging worker shutdown (signal)");
                break;
            }
        }
    }
});

Self { tx: Some(tx), shutdown: Some(shutdown_tx) }
```

- [ ] **Step 2: Add `shutdown` method to `AxiomLogger`**

```rust
pub fn shutdown(&self) {
    if let Some(shutdown) = &self.shutdown {
        let _ = shutdown.send(());
    }
}
```

- [ ] **Step 3: Call `axiom.shutdown()` in `main.rs` before exit**

```rust
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // ... existing setup ...

    let axiom_logger = logging::AxiomLogger::new(logging::AxiomConfig::default());
    let ctx = AppContext::from_env(axiom_logger.clone()).await?;
    let app = connect::build_router_with_context(ctx);
    tracing::info!(%addr, "engine-service listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;

    // Wait for ctrl-c, then flush axiom logs
    let axiom_for_shutdown = axiom_logger.clone();
    let shutdown_signal = async {
        tokio::signal::ctrl_c().await.ok();
    };

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    axiom_for_shutdown.shutdown();
    // Give the worker a moment to flush
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    Ok(())
}
```

- [ ] **Step 4: Run `cargo build` and `cargo clippy -- -D warnings`**

---

### Task 7: Log batch flush results

**Files:**
- Modify: `src/logging.rs:212-227` (flush_batch)

Currently `flush_batch` discards the `IngestStatus`. Log the count for observability.

- [ ] **Step 1: Log successful ingest count**

```rust
async fn flush_batch(
    client: &Arc<axiom_rs::Client>,
    dataset: &str,
    batch: &mut Vec<AxiomEvent>,
) {
    if batch.is_empty() {
        return;
    }
    let count = batch.len();
    let events = std::mem::take(batch);
    match client.ingest(dataset, &events).await {
        Ok(status) => {
            tracing::debug!(count, ingested = status.ingested, "axiom batch flushed");
        }
        Err(e) => {
            tracing::warn!(error = %e, count, "axiom ingest failed (dropping batch)");
        }
    }
}
```

- [ ] **Step 2: Run `cargo build` and `cargo clippy -- -D warnings`**

---

### Task 8: Final verification

- [ ] **Step 1: Run `cargo fmt`**

- [ ] **Step 2: Run `cargo clippy -- -D warnings`**

- [ ] **Step 3: Run `cargo test --lib`**

Expected: all unit tests pass

- [ ] **Step 4: Verify the service starts cleanly without AXIOM_TOKEN (degraded mode)**

Run: `cargo run` without `AXIOM_TOKEN` set. Expected: starts normally, logs "axiom logging disabled".

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `AXIOM_TOKEN` | (none) | Required API token. Without this, axiom logging is disabled. |
| `AXIOM_DATASET` | `"parley"` | Dataset name for log ingestion. |
| `AXIOM_ORG_ID` | (none) | Organization ID (required for personal tokens). |
| `AXIOM_BATCH_SIZE` | `100` | Max events per batch before forced flush. |
| `AXIOM_FLUSH_MS` | `1000` | Flush interval in milliseconds (time-based fallback). |
| `AXIOM_BUFFER` | `2048` | mpsc channel capacity (backpressure threshold). |
| `AXIOM_ENABLED` | `"true"` | Set to `"false"` to disable entirely. |
