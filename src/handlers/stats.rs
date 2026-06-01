//! Stats handlers: both the debugging REST endpoint (`GET /stats/:username`)
//! and the ConnectRPC endpoints for `StatsService.FetchStats` /
//! `FetchStatsCollection`.
//!
//! A single shared `StatsClient` is reused across all requests so that
//! reqwest's HTTP/2 connection pool can keep TLS sessions alive and cut
//! per-request latency.

use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use crate::backends::Game as BackendGame;
use crate::cache_store::StatsCacheStore;
use crate::fetch::{StatsFetchError, StatsFetchErrorKind, StatsPlatform};
use crate::stats_proto::common::v1::Error as ProtoError;
use crate::stats_proto::stats::v1::{
    CalculatedMetrics as ProtoCalculatedMetrics, FetchStatsCollectionRequest,
    FetchStatsCollectionResponse, FetchStatsRequest, FetchStatsResponse,
    RankedStats as ProtoRanked, ScrapedStats as ProtoScrapedStats,
    ScrapedStatsCollection as ProtoScrapedCollection,
    SeasonCatalogEntry as ProtoSeasonCatalogEntry, StatsPlatform as ProtoPlatform,
    StatsProfile as ProtoProfile,
};
use crate::scrape::{
    CalculatedMetrics, RankedStats, ScrapedStats, ScrapedStatsCollection, SeasonCatalogEntry,
    StatsProfile,
};
use crate::backends::StatsBackendRegistry;
use crate::cache::StatsCache;
use crate::fetch::StatsClient;
use std::collections::HashMap;
use std::sync::Arc;

use crate::context::AppContext;

/// Shared handler state. Wraps a long-lived `StatsClient` so the reqwest
/// connection pool is reused across requests, plus:
///   * legacy in-memory `StatsCache` for the R6-only `/stats/:username` REST
///     endpoint (kept for backwards compatibility);
///   * optional modern `StatsCacheStore` for game-aware ConnectRPC traffic,
///     which may be backed by Postgres snapshots in production.
pub struct StatsHandler {
    client: StatsClient,
    cache: Arc<StatsCache>,
    cache_store: Option<Arc<dyn StatsCacheStore>>,
    registry: Arc<StatsBackendRegistry>,
}

impl Default for StatsHandler {
    fn default() -> Self {
        let client = StatsClient::default();
        let mut registry = StatsBackendRegistry::new();
        registry.register(Arc::new(crate::backends::r6::R6Backend::new(client.clone())));
        Self {
            client,
            cache: Arc::new(StatsCache::default()),
            cache_store: None,
            registry: Arc::new(registry),
        }
    }
}

impl StatsHandler {
    pub fn with_client(client: StatsClient) -> Self {
        let mut registry = StatsBackendRegistry::new();
        registry.register(Arc::new(crate::backends::r6::R6Backend::new(client.clone())));
        Self {
            client,
            cache: Arc::new(StatsCache::default()),
            cache_store: None,
            registry: Arc::new(registry),
        }
    }

    pub fn with_client_and_cache(client: StatsClient, cache: StatsCache) -> Self {
        let mut registry = StatsBackendRegistry::new();
        registry.register(Arc::new(crate::backends::r6::R6Backend::new(client.clone())));
        Self {
            client,
            cache: Arc::new(cache),
            cache_store: None,
            registry: Arc::new(registry),
        }
    }

    /// Enable the game-aware cache store for ConnectRPC traffic. When set,
    /// `fetch_stats_rpc` / `fetch_stats_collection_rpc` route through it;
    /// the REST `/stats/:username` path keeps using the legacy in-memory
    /// cache for backwards compatibility.
    pub fn with_cache_store(mut self, store: Arc<dyn StatsCacheStore>) -> Self {
        self.cache_store = Some(store);
        self
    }

    pub fn with_registry(mut self, registry: Arc<StatsBackendRegistry>) -> Self {
        self.registry = registry;
        self
    }

    pub fn client(&self) -> &StatsClient {
        &self.client
    }

    pub fn cache(&self) -> &StatsCache {
        &self.cache
    }

    pub fn registry(&self) -> &StatsBackendRegistry {
        &self.registry
    }

    /// Cache-aware fetch. Returns a cached copy when available; otherwise
    /// scrapes upstream and populates the cache on success.
    pub async fn fetch_cached(
        &self,
        username: &str,
        platform: StatsPlatform,
        season: Option<&str>,
    ) -> Result<ScrapedStats, StatsFetchError> {
        if let Some(hit) = self.cache.get(username, platform, season) {
            tracing::debug!(%username, ?platform, cached = true, "stats cache hit");
            return Ok(hit);
        }
        let stats = self.client.fetch_stats(username, platform, season).await?;
        self.cache.put(username, platform, season, stats.clone());
        Ok(stats)
    }

    pub async fn fetch_stats_rpc(&self, req: FetchStatsRequest) -> FetchStatsResponse {
        let platform = map_proto_platform(req.platform);
        let season = empty_to_none(&req.season_selector);
        let game = map_proto_game(req.game);

        // Prefer the game-aware cache store when present (production path).
        if let Some(store) = &self.cache_store {
            return match store.fetch(game, &req.username, platform, season).await {
                Ok(cached) => FetchStatsResponse {
                    success: true,
                    stats: Some(proto_from_scraped(&cached.stats)),
                    error: None,
                },
                Err(e) => FetchStatsResponse {
                    success: false,
                    stats: None,
                    error: Some(proto_error(&e)),
                },
            };
        }

        // Legacy in-memory R6-only path.
        if !matches!(game, BackendGame::R6) {
            // No cache store + non-R6 game == no backend wired yet.
            return FetchStatsResponse {
                success: false,
                stats: None,
                error: Some(ProtoError {
                    code: "GcUnavailable".into(),
                    message: format!(
                        "no backend registered for game {} (start with DATABASE_URL set and a brawl-stars backend)",
                        game.as_str()
                    ),
                }),
            };
        }
        match self.fetch_cached(&req.username, platform, season).await {
            Ok(stats) => FetchStatsResponse {
                success: true,
                stats: Some(proto_from_scraped(&stats)),
                error: None,
            },
            Err(e) => FetchStatsResponse {
                success: false,
                stats: None,
                error: Some(proto_error(&e)),
            },
        }
    }

    pub async fn fetch_stats_collection_rpc(
        &self,
        req: FetchStatsCollectionRequest,
    ) -> FetchStatsCollectionResponse {
        let platform = map_proto_platform(req.platform);
        let game = map_proto_game(req.game);

        if let Some(store) = &self.cache_store {
            return match store.fetch_collection(game, &req.username, platform).await {
                Ok(c) => FetchStatsCollectionResponse {
                    success: true,
                    collection: Some(proto_from_collection(&c)),
                    error: None,
                },
                Err(e) => FetchStatsCollectionResponse {
                    success: false,
                    collection: None,
                    error: Some(proto_error(&e)),
                },
            };
        }

        // Legacy R6-only path.
        if let Some(cached) = self.cache.get_collection(&req.username, platform) {
            return FetchStatsCollectionResponse {
                success: true,
                collection: Some(proto_from_collection(&cached)),
                error: None,
            };
        }
        match self
            .client
            .fetch_stats_collection(&req.username, platform)
            .await
        {
            Ok(c) => {
                self.cache
                    .put_collection(&req.username, platform, c.clone());
                FetchStatsCollectionResponse {
                    success: true,
                    collection: Some(proto_from_collection(&c)),
                    error: None,
                }
            }
            Err(e) => FetchStatsCollectionResponse {
                success: false,
                collection: None,
                error: Some(proto_error(&e)),
            },
        }
    }
}

// ---------- REST endpoint ----------

#[derive(Debug, Deserialize)]
pub struct StatsQuery {
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(default)]
    pub season: Option<String>,
    /// `"r6"` (default) or `"brawl_stars"`.
    #[serde(default)]
    pub game: Option<String>,
    /// Optional base URL override, used by tests to point at a mock server.
    #[serde(default)]
    pub base_url: Option<String>,
}

pub async fn stats_get(
    State(state): State<AppContext>,
    Path(username): Path<String>,
    Query(q): Query<StatsQuery>,
) -> Response {
    let platform = match q.platform.as_deref() {
        None | Some("auto") | Some("") => StatsPlatform::Auto,
        Some("pc") => StatsPlatform::Pc,
        Some("xbox") => StatsPlatform::Xbox,
        Some("playstation") => StatsPlatform::Playstation,
        Some(other) => return bad_request(format!("unsupported platform: {other}")),
    };

    let game = match q.game.as_deref() {
        None | Some("") | Some("r6") | Some("R6") => BackendGame::R6,
        Some("brawl_stars") | Some("brawlstars") | Some("BrawlStars") => BackendGame::BrawlStars,
        Some(other) => return bad_request(format!("unsupported game: {other}")),
    };

    // Non-R6 games go through the backend registry. The legacy `?base_url=`
    // wiremock path is R6-only.
    if matches!(game, BackendGame::BrawlStars) {
        let result = state
            .stats
            .registry()
            .fetch(game, &username, platform, q.season.as_deref())
            .await;
        return match result {
            Ok(stats) => Json(stats).into_response(),
            Err(err) => map_error(err).into_response(),
        };
    }

    // R6 path — preserves the existing wiremock `?base_url=` test hook.
    let result = match q.base_url.as_deref() {
        Some(base) => {
            let scoped = StatsClient::with_base_url(base);
            scoped
                .fetch_stats(&username, platform, q.season.as_deref())
                .await
        }
        None => {
            state
                .stats
                .fetch_cached(&username, platform, q.season.as_deref())
                .await
        }
    };

    match result {
        Ok(stats) => Json(stats).into_response(),
        Err(err) => map_error(err).into_response(),
    }
}

fn bad_request(msg: impl Into<String>) -> Response {
    let body = serde_json::json!({ "code": "invalid_argument", "message": msg.into() });
    (StatusCode::BAD_REQUEST, Json(body)).into_response()
}

fn map_error(err: StatsFetchError) -> Response {
    let status = match err.kind {
        StatsFetchErrorKind::ProfileNotFound | StatsFetchErrorKind::SeasonNotFound => {
            StatusCode::NOT_FOUND
        }
        StatsFetchErrorKind::InvalidProfile | StatsFetchErrorKind::InvalidPayload => {
            StatusCode::BAD_GATEWAY
        }
        StatsFetchErrorKind::HttpStatus if !err.retryable => StatusCode::BAD_GATEWAY,
        StatsFetchErrorKind::HttpStatus => StatusCode::SERVICE_UNAVAILABLE,
        StatsFetchErrorKind::Network => StatusCode::SERVICE_UNAVAILABLE,
        StatsFetchErrorKind::GcUnavailable => StatusCode::SERVICE_UNAVAILABLE,
    };

    let body = serde_json::json!({
        "code": format!("{:?}", err.kind),
        "message": err.message,
        "retryable": err.retryable,
        "status": err.status,
        "requestedSeason": err.requested_season,
        "availableSeasons": err.available_seasons,
    });
    (status, Json(body)).into_response()
}

// ---------- proto conversions ----------

fn empty_to_none(s: &str) -> Option<&str> {
    if s.trim().is_empty() { None } else { Some(s) }
}

fn map_proto_platform(v: i32) -> StatsPlatform {
    match ProtoPlatform::try_from(v).unwrap_or(ProtoPlatform::Unspecified) {
        ProtoPlatform::Pc => StatsPlatform::Pc,
        ProtoPlatform::Xbox => StatsPlatform::Xbox,
        ProtoPlatform::Playstation => StatsPlatform::Playstation,
        _ => StatsPlatform::Auto,
    }
}

/// Proto `Game` → backend `Game`. Defaults to R6 for GAME_UNSPECIFIED so that
/// existing clients who never set the field keep working.
fn map_proto_game(v: i32) -> BackendGame {
    use crate::stats_proto::common::v1::Game as ProtoGame;
    match ProtoGame::try_from(v).unwrap_or(ProtoGame::Unspecified) {
        ProtoGame::BrawlStars => BackendGame::BrawlStars,
        _ => BackendGame::R6,
    }
}

fn proto_error(e: &StatsFetchError) -> ProtoError {
    ProtoError {
        code: format!("{:?}", e.kind),
        message: e.message.clone(),
    }
}

fn proto_from_scraped(s: &ScrapedStats) -> ProtoScrapedStats {
    ProtoScrapedStats {
        profile: Some(proto_from_profile(&s.profile)),
        ranked_stats: Some(proto_from_ranked(&s.ranked_stats)),
        calculated_metrics: Some(proto_from_metrics(&s.calculated_metrics)),
    }
}

fn proto_from_profile(p: &StatsProfile) -> ProtoProfile {
    ProtoProfile {
        username: p.username.clone(),
        level: p.level,
        profile_id: p.profile_id.clone(),
        platform: p.platform.clone(),
        profile_url: p.profile_url.clone(),
    }
}

fn proto_from_ranked(r: &RankedStats) -> ProtoRanked {
    ProtoRanked {
        season: r.season.clone(),
        season_slug: r.season_slug.clone(),
        season_display: r.season_display.clone(),
        season_started_at: r.season_started_at.clone(),
        mode: r.mode.clone(),
        matches: r.matches,
        wins: r.wins,
        losses: r.losses,
        abandons: r.abandons,
        kills: r.kills,
        deaths: r.deaths,
        assists: r.assists,
        headshots: r.headshots,
        kd_ratio: r.kd_ratio,
        headshot_percentage: r.headshot_percentage,
        win_rate: r.win_rate,
        rank_points: r.rank_points,
        peak_rank_points: r.peak_rank_points,
        current_rank_slug: r.current_rank_slug.clone(),
        current_rank: r.current_rank.clone(),
        current_rank_tier: r.current_rank_tier.clone(),
        peak_rank_slug: r.peak_rank_slug.clone(),
        peak_rank: r.peak_rank.clone(),
        peak_rank_tier: r.peak_rank_tier.clone(),
        all_time_peak_rank_slug: r.all_time_peak_rank_slug.clone(),
        all_time_peak_rank: r.all_time_peak_rank.clone(),
        all_time_peak_rank_tier: r.all_time_peak_rank_tier.clone(),
        all_time_peak_rank_points: r.all_time_peak_rank_points,
        all_time_peak_rank_season: r.all_time_peak_rank_season.clone(),
        rounds_played: r.rounds_played,
        kill_rounds: r.kill_rounds,
        survival_rounds: r.survival_rounds,
        traded_rounds: r.traded_rounds,
        opening_kill_rounds: r.opening_kill_rounds,
        matches_in_cache: r.matches_in_cache,
    }
}

fn proto_from_metrics(m: &CalculatedMetrics) -> ProtoCalculatedMetrics {
    ProtoCalculatedMetrics {
        kost: m.kost,
        kost_lower_bound: m.kost_lower_bound,
        kost_upper_bound: m.kost_upper_bound,
        kost_description: m.kost_description.clone(),
    }
}

fn proto_from_collection(c: &ScrapedStatsCollection) -> ProtoScrapedCollection {
    let mut by_season: HashMap<String, ProtoScrapedStats> =
        HashMap::with_capacity(c.by_season.len());
    for (slug, stats) in &c.by_season {
        by_season.insert(slug.clone(), proto_from_scraped(stats));
    }
    ProtoScrapedCollection {
        latest: Some(proto_from_scraped(&c.latest)),
        by_season,
        season_catalog: c
            .season_catalog
            .iter()
            .map(proto_from_catalog_entry)
            .collect(),
    }
}

fn proto_from_catalog_entry(e: &SeasonCatalogEntry) -> ProtoSeasonCatalogEntry {
    ProtoSeasonCatalogEntry {
        slug: e.slug.clone(),
        display: e.display.clone(),
        started_at: e.started_at.clone(),
    }
}
