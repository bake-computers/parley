//! Axiom structured logging layer with batched ingestion.
//!
//! Architecture:
//!   Request/DB operation → tracing (stdout, dev) + AxiomLogChannel (Axiom)
//!   AxiomLogChannel → mpsc channel → background worker → batch flush to Axiom
//!
//! Environment variables:
//!   AXIOM_TOKEN         — required API token
//!   AXIOM_DATASET      — dataset name (default: "parley")
//!   AXIOM_ORG_ID       — organization ID (optional)
//!   AXIOM_BATCH_SIZE   — max events per batch (default: 100)
//!   AXIOM_FLUSH_MS     — flush interval ms (default: 1000)
//!   AXIOM_BUFFER       — channel capacity (default: 2048)
//!   AXIOM_ENABLED      — set to "false" to disable (default: true)

use serde::Serialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

/// Discriminant for log events sent to Axiom.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event")]
pub enum AxiomEvent {
    /// HTTP request lifecycle event.
    Http {
        method: String,
        path: String,
        status: u16,
        duration_ms: f64,
        user_agent: Option<String>,
        content_type: Option<String>,
        origin: Option<String>,
    },
    /// Database query event.
    Db {
        operation: String,
        table: String,
        duration_ms: f64,
        error: Option<String>,
    },
    /// Cache event (hit/miss/stale).
    Cache {
        action: String,
        game: String,
        username_hash: Option<String>,
    },
    /// Handler-level error event.
    Error {
        service: String,
        code: String,
        message: String,
        path: Option<String>,
    },
}

/// Configuration resolved from environment.
#[derive(Debug, Clone)]
pub struct AxiomConfig {
    pub token: Option<String>,
    pub dataset: String,
    pub org_id: Option<String>,
    pub batch_size: usize,
    pub flush_interval: Duration,
    pub buffer_size: usize,
    pub enabled: bool,
}

impl Default for AxiomConfig {
    fn default() -> Self {
        Self {
            token: std::env::var("AXIOM_TOKEN").ok().filter(|s| !s.is_empty()),
            dataset: std::env::var("AXIOM_DATASET").unwrap_or_else(|_| "parley".into()),
            org_id: std::env::var("AXIOM_ORG_ID").ok().filter(|s| !s.is_empty()),
            batch_size: std::env::var("AXIOM_BATCH_SIZE")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(100),
            flush_interval: std::env::var("AXIOM_FLUSH_MS")
                .ok()
                .and_then(|s| s.parse().ok())
                .map(Duration::from_millis)
                .unwrap_or(Duration::from_secs(1)),
            buffer_size: std::env::var("AXIOM_BUFFER")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(2048),
            enabled: std::env::var("AXIOM_ENABLED")
                .map(|s| s != "false")
                .unwrap_or(true),
        }
    }
}

impl AxiomConfig {
    pub fn is_configured(&self) -> bool {
        self.enabled && self.token.is_some()
    }
}

/// The Axiom logging layer. Cloneable — store one in AppContext.
#[derive(Clone)]
pub struct AxiomLogger {
    tx: Option<mpsc::Sender<AxiomEvent>>,
    shutdown: Option<tokio::sync::watch::Sender<()>>,
}

impl AxiomLogger {
    /// Create a new AxiomLogger. Starts the background worker if configured.
    pub fn new(config: AxiomConfig) -> Self {
        if !config.is_configured() {
            tracing::info!("axiom logging disabled (no token or AXIOM_ENABLED=false)");
            return Self {
                tx: None,
                shutdown: None,
            };
        }

        let token = config.token.clone().unwrap();
        let dataset = config.dataset.clone();
        let org_id = config.org_id.clone();
        let batch_size = config.batch_size;
        let flush_interval = config.flush_interval;

        let (tx, mut rx) = mpsc::channel(config.buffer_size);
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(());

        // Spawn the background batch worker
        tokio::spawn(async move {
            let mut builder = axiom_rs::Client::builder().with_token(&token);
            if let Some(ref org) = org_id {
                builder = builder.with_org_id(org);
            }
            let client = Arc::new(builder.build().expect("axiom client builds"));

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
                        // Drain any remaining events that are already queued in the channel so they get flushed before shutdown
                        while let Ok(event) = rx.try_recv() {
                            batch.push(event);
                            if batch.len() >= batch_size {
                                Self::flush_batch(&client, &dataset, &mut batch).await;
                            }
                        }
                        if !batch.is_empty() {
                            Self::flush_batch(&client, &dataset, &mut batch).await;
                        }
                        tracing::info!("axiom logging worker shutdown (signal)");
                        break;
                    }
                }
            }
        });

        tracing::info!(
            dataset = %config.dataset,
            batch_size,
            flush_ms = %flush_interval.as_millis(),
            "axiom logging enabled"
        );

        Self {
            tx: Some(tx),
            shutdown: Some(shutdown_tx),
        }
    }

    /// Send an event to Axiom (no-op if disabled).
    pub fn log(&self, event: AxiomEvent) {
        if let Some(tx) = &self.tx {
            // Drop if channel is full (backpressure)
            let _ = tx.try_send(event);
        }
    }

    /// Log an HTTP request event.
    #[allow(clippy::too_many_arguments)]
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

    /// Log a database query event.
    pub fn log_db(&self, operation: &str, table: &str, duration_ms: f64, error: Option<String>) {
        self.log(AxiomEvent::Db {
            operation: operation.to_string(),
            table: table.to_string(),
            duration_ms,
            error,
        });
    }

    /// Log a cache event.
    pub fn log_cache(&self, action: &str, game: &str, username_hash: Option<String>) {
        self.log(AxiomEvent::Cache {
            action: action.to_string(),
            game: game.to_string(),
            username_hash,
        });
    }

    /// Log a handler-level error event.
    pub fn log_error(&self, service: &str, code: &str, message: &str, path: Option<String>) {
        self.log(AxiomEvent::Error {
            service: service.to_string(),
            code: code.to_string(),
            message: message.to_string(),
            path,
        });
    }

    /// Signal the background worker to flush and shut down.
    pub fn shutdown(&self) {
        if let Some(shutdown) = &self.shutdown {
            let _ = shutdown.send(());
        }
    }

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
}

/// No-op logger for when Axiom is disabled.
impl Default for AxiomLogger {
    fn default() -> Self {
        Self {
            tx: None,
            shutdown: None,
        }
    }
}

use axum::{
    extract::Request,
    http::{HeaderName, header::CONTENT_TYPE},
    response::Response,
};
use std::future::Future;
use std::net::SocketAddr;
use std::pin::Pin;
use tower::{Layer, Service};

/// Tower middleware layer for Axiom HTTP logging.
#[derive(Clone)]
pub struct AxiomLogLayer {
    logger: AxiomLogger,
}

impl AxiomLogLayer {
    pub fn new(logger: AxiomLogger) -> Self {
        Self { logger }
    }
}

impl<S> Layer<S> for AxiomLogLayer {
    type Service = AxiomLogService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        AxiomLogService {
            inner,
            logger: self.logger.clone(),
        }
    }
}

#[derive(Clone)]
pub struct AxiomLogService<S> {
    inner: S,
    logger: AxiomLogger,
}

impl<S> Service<Request> for AxiomLogService<S>
where
    S: Service<Request, Response = Response> + Clone + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = Response;
    type Error = S::Error;
    #[allow(clippy::type_complexity)]
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(
        &mut self,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request) -> Self::Future {
        let logger = self.logger.clone();
        let start = Instant::now();

        // Extract origin before moving req into async block
        let origin = extract_origin(&req);

        // Clone service for the async block
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

            logger.log_http(
                &method,
                &path,
                status,
                duration_ms,
                user_agent,
                content_type,
                origin,
            );

            Ok(response)
        })
    }
}

fn extract_origin(req: &Request) -> Option<String> {
    // Check proxy headers first (Cloudflare, load balancers)
    if let Some(v) = req.headers().get("cf-connecting-ip")
        && let Ok(s) = v.to_str()
    {
        return Some(s.to_string());
    }
    if let Some(v) = req.headers().get("x-forwarded-for")
        && let Ok(s) = v.to_str()
    {
        // Take the first IP in the chain
        return Some(s.split(',').next()?.trim().to_string());
    }
    if let Some(v) = req.headers().get("x-real-ip")
        && let Ok(s) = v.to_str()
    {
        return Some(s.to_string());
    }
    // Fall back to socket peer address (works in local dev)
    req.extensions()
        .get::<SocketAddr>()
        .map(|addr| addr.ip().to_string())
}
