//! Async HTTP fetch layer using `reqwest`. Ported from `resolveProfileTargetResult`
//! and `fetchStatsPageInternal` in the TS source.

use crate::scrape::{
    canonicalize_season_selector, scrape_html_stats_collection, ScrapedStats,
    ScrapedStatsCollection, SeasonCatalogEntry,
};
use once_cell::sync::Lazy;
use regex::Regex;
use reqwest::Client;
use thiserror::Error;
use url::Url;

const PLATFORM_SEARCH_ORDER: &[StatsPlatform] = &[
    StatsPlatform::Pc,
    StatsPlatform::Xbox,
    StatsPlatform::Playstation,
];

/// Desktop UA used for both profile resolution and page fetch. Matches the TS
/// `UserAgents({ deviceCategory: "desktop" }).toString()` behaviour closely
/// enough; we pick a recent Chrome UA since stats.cc serves the same HTML to
/// any modern desktop browser.
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) \
    AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

static UUID_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
    )
    .expect("UUID regex compiles")
});

/// Canonicalised platform values supported by stats.cc.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum StatsPlatform {
    Auto,
    Pc,
    Xbox,
    Playstation,
}

impl StatsPlatform {
    fn as_query(self) -> Option<&'static str> {
        match self {
            StatsPlatform::Auto => None,
            StatsPlatform::Pc => Some("pc"),
            StatsPlatform::Xbox => Some("xbox"),
            StatsPlatform::Playstation => Some("playstation"),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            StatsPlatform::Auto => "auto",
            StatsPlatform::Pc => "pc",
            StatsPlatform::Xbox => "xbox",
            StatsPlatform::Playstation => "playstation",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StatsFetchErrorKind {
    Network,
    HttpStatus,
    ProfileNotFound,
    InvalidProfile,
    InvalidPayload,
    SeasonNotFound,
    /// Game backend is down / unreachable / rate-limited.
    GcUnavailable,
}

#[derive(Debug, Error)]
#[error("{kind:?}: {message}")]
pub struct StatsFetchError {
    pub kind: StatsFetchErrorKind,
    pub message: String,
    pub retryable: bool,
    pub status: Option<u16>,
    pub requested_season: Option<String>,
    pub available_seasons: Vec<SeasonCatalogEntry>,
}

impl StatsFetchError {
    fn new(kind: StatsFetchErrorKind, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            kind,
            message: message.into(),
            retryable,
            status: None,
            requested_season: None,
            available_seasons: Vec::new(),
        }
    }
}

fn is_retryable_status(status: u16) -> bool {
    status == 429 || status >= 500
}

#[derive(Clone, Debug)]
struct ResolvedProfileTarget {
    #[allow(dead_code)]
    username: String,
    uuid: String,
    platform: StatsPlatform,
    profile_url: String,
}

fn normalize_display_name(v: &str) -> String {
    // Only used for the pre-computed "expected" value we compare against. We
    // keep it as ASCII-lowercase because downstream comparisons go through
    // `eq_ignore_ascii_case`, but callers also log/store this normalised
    // form so we allocate once up-front.
    v.trim().to_ascii_lowercase()
}

fn parse_resolved_profile_url(url: &str) -> Option<(String, String)> {
    let parsed = Url::parse(url).ok()?;
    let parts: Vec<&str> = parsed
        .path_segments()
        .map(|s| s.filter(|p| !p.is_empty()).collect())
        .unwrap_or_default();
    if parts.len() < 3 || parts[0] != "siege" {
        return None;
    }
    let username = percent_decode(parts[1])?;
    // UUIDs are ASCII hex; `to_ascii_lowercase` is allocation-light and
    // canonicalises the case for downstream use (URL building + cache keys).
    let uuid = parts[2].to_ascii_lowercase();
    if username.is_empty() || !UUID_REGEX.is_match(&uuid) {
        return None;
    }
    Some((username, uuid))
}

fn percent_decode(s: &str) -> Option<String> {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
            let byte = u8::from_str_radix(hex, 16).ok()?;
            out.push(byte as char);
            i += 3;
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }
    Some(out)
}

fn platform_search_order(p: StatsPlatform) -> Vec<StatsPlatform> {
    match p {
        StatsPlatform::Auto => PLATFORM_SEARCH_ORDER.to_vec(),
        other => vec![other],
    }
}

/// Reusable async client. Construct one and share it across calls.
#[derive(Clone)]
pub struct StatsClient {
    http: Client,
    base_url: String,
    retry: RetryPolicy,
}

/// Retry configuration for retryable upstream errors (429, 5xx, network).
#[derive(Clone, Copy, Debug)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub initial_backoff_ms: u64,
    pub max_backoff_ms: u64,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 2,
            initial_backoff_ms: 200,
            max_backoff_ms: 2_000,
        }
    }
}

impl RetryPolicy {
    /// Disable retries entirely. Used by tests that want deterministic single-shot behaviour.
    pub fn none() -> Self {
        Self {
            max_attempts: 1,
            initial_backoff_ms: 0,
            max_backoff_ms: 0,
        }
    }
}

impl Default for StatsClient {
    fn default() -> Self {
        Self::with_base_url("https://stats.cc")
    }
}

impl StatsClient {
    pub fn with_base_url(base_url: impl Into<String>) -> Self {
        let http = Client::builder()
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::limited(10))
            // stats.cc can be very slow (20s+ SSR times). Cap the per-request
            // timeout so we fail fast and retry (or surface the error) rather
            // than hanging the caller. 12s total / 5s connect is generous enough
            // for normal responses but cuts off the pathological 20s+ cases.
            .timeout(std::time::Duration::from_secs(12))
            .connect_timeout(std::time::Duration::from_secs(5))
            // Keep idle connections alive longer and allow enough pooled
            // connections for the parallel platform-search tasks (up to 3
            // concurrent requests for AUTO lookups).
            .pool_idle_timeout(std::time::Duration::from_secs(120))
            .pool_max_idle_per_host(4)
            .tcp_keepalive(std::time::Duration::from_secs(60))
            .build()
            .expect("reqwest client builds");
        Self {
            http,
            base_url: base_url.into(),
            retry: RetryPolicy::default(),
        }
    }

    pub fn with_client(base_url: impl Into<String>, http: Client) -> Self {
        Self {
            http,
            base_url: base_url.into(),
            retry: RetryPolicy::default(),
        }
    }

    /// Override the retry policy.
    pub fn with_retry(mut self, retry: RetryPolicy) -> Self {
        self.retry = retry;
        self
    }

    /// Pre-establish a TCP+TLS connection to the upstream host and cache its
    /// DNS resolution. Call once at startup so the first real request skips
    /// the ~200-500ms connection handshake.
    pub async fn warmup(&self) {
        let url = format!("{}/", self.base_url);
        match self.http.head(&url).send().await {
            Ok(_) => tracing::info!(%url, "stats upstream connection pool warmed"),
            Err(e) => tracing::warn!(%url, error = %e, "stats upstream warmup failed (non-fatal)"),
        }
    }

    async fn resolve_profile_target(
        &self,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<(ResolvedProfileTarget, Option<String>), StatsFetchError> {
        let expected = normalize_display_name(username);

        let order = platform_search_order(platform);

        // Parallel path: for auto searches, race all three platforms and take
        // the first one that yields a valid canonical profile URL.
        if platform == StatsPlatform::Auto && order.len() > 1 {
            return self
                .resolve_profile_target_parallel(&order, &expected)
                .await;
        }

        for current in order {
            match self
                .try_resolve_one(username, current, &expected, true)
                .await?
            {
                Some(hit) => return Ok(hit),
                None => continue,
            }
        }

        Err(StatsFetchError::new(
            StatsFetchErrorKind::ProfileNotFound,
            "Could not resolve profile target",
            false,
        ))
    }

    async fn resolve_profile_target_parallel(
        &self,
        order: &[StatsPlatform],
        expected: &str,
    ) -> Result<(ResolvedProfileTarget, Option<String>), StatsFetchError> {
        // Spawn one task per platform and take the first successful match.
        let mut joinset = tokio::task::JoinSet::new();
        for p in order {
            let client = self.clone();
            let p = *p;
            let expected = expected.to_string();
            // Re-run try_resolve_one with the same expected (strict match, since auto).
            joinset.spawn(async move { client.try_resolve_one_owned(p, expected).await });
        }

        let mut last_err: Option<StatsFetchError> = None;
        while let Some(res) = joinset.join_next().await {
            match res {
                Ok(Ok(Some(hit))) => {
                    joinset.abort_all();
                    return Ok(hit);
                }
                Ok(Ok(None)) => continue,
                Ok(Err(e)) => last_err = Some(e),
                Err(_) => {}
            }
        }

        if let Some(e) = last_err {
            return Err(e);
        }
        Err(StatsFetchError::new(
            StatsFetchErrorKind::ProfileNotFound,
            "Could not resolve profile target",
            false,
        ))
    }

    async fn try_resolve_one_owned(
        &self,
        current: StatsPlatform,
        expected: String,
    ) -> Result<Option<(ResolvedProfileTarget, Option<String>)>, StatsFetchError> {
        // Derive the displayName from expected; for parallel auto-search,
        // the caller already normalised it, but we want the original casing
        // in the query string. Since we only have the normalised form here,
        // pass it through — stats.cc is case-insensitive on displayName.
        self.try_resolve_one(&expected, current, &expected, true)
            .await
    }

    async fn try_resolve_one(
        &self,
        username: &str,
        current: StatsPlatform,
        expected: &str,
        strict_name_match: bool,
    ) -> Result<Option<(ResolvedProfileTarget, Option<String>)>, StatsFetchError> {
        let mut url = Url::parse(&format!("{}/siege", self.base_url)).map_err(|e| {
            StatsFetchError::new(StatsFetchErrorKind::Network, e.to_string(), false)
        })?;
        url.query_pairs_mut().append_pair("displayName", username);
        if let Some(p) = current.as_query() {
            url.query_pairs_mut().append_pair("platform", p);
        }

        let response = match self.http.get(url).send().await {
            Ok(r) => r,
            Err(_) => {
                return Err(StatsFetchError::new(
                    StatsFetchErrorKind::Network,
                    "Profile lookup request failed",
                    true,
                ));
            }
        };

        let status = response.status().as_u16();
        let final_url = response.url().to_string();

        // Greedily consume the body. stats.cc embeds the full payload in the
        // redirected-to profile page, so we can skip the second GET entirely
        // when the final URL parses and the body has a payload.
        let body = response.text().await.ok();

        let parsed = parse_resolved_profile_url(&final_url);
        if parsed.is_none() {
            if is_retryable_status(status) {
                return Err(StatsFetchError {
                    status: Some(status),
                    ..StatsFetchError::new(
                        StatsFetchErrorKind::HttpStatus,
                        "Profile lookup returned retryable status",
                        true,
                    )
                });
            }
            return Ok(None);
        }

        let (resolved_user, uuid) = parsed.unwrap();

        // For auto searches, strict name-match to avoid cross-platform collisions.
        // `expected` is already ASCII-lowercased + trimmed; comparing via
        // `eq_ignore_ascii_case` skips allocating a second normalised string.
        if strict_name_match && !resolved_user.trim().eq_ignore_ascii_case(expected) {
            return Ok(None);
        }

        let profile_url = format!(
            "{}/siege/{}/{}",
            self.base_url,
            urlencoding_encode(&resolved_user),
            uuid
        );
        Ok(Some((
            ResolvedProfileTarget {
                username: resolved_user,
                uuid,
                platform: current,
                profile_url,
            },
            body,
        )))
    }

    async fn fetch_stats_page(
        &self,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<(ResolvedProfileTarget, String), StatsFetchError> {
        let (target, body) = self.resolve_profile_target(username, platform).await?;

        // If resolve already downloaded a body that contains the Nuxt payload,
        // reuse it — no second network round-trip.
        if let Some(html) = body {
            if html.contains("__NUXT_DATA__") {
                return Ok((target, html));
            }
        }

        // Fall back to an explicit fetch for the canonical URL. This happens
        // when the redirect was served with an empty/non-HTML body, or when
        // the body didn't contain the payload marker.
        let mut url = Url::parse(&target.profile_url).map_err(|e| {
            StatsFetchError::new(StatsFetchErrorKind::Network, e.to_string(), false)
        })?;
        url.query_pairs_mut()
            .append_pair("addToRecents", "true")
            .append_pair("playlist", "ranked");

        let response = self.http.get(url).send().await.map_err(|_| {
            StatsFetchError::new(
                StatsFetchErrorKind::Network,
                "Stats page request failed",
                true,
            )
        })?;

        let status = response.status().as_u16();
        let html = response.text().await.map_err(|e| {
            StatsFetchError::new(
                StatsFetchErrorKind::Network,
                format!("Failed to read response body: {e}"),
                true,
            )
        })?;

        let is_success = (200..300).contains(&status);
        if !is_success && !html.contains("__NUXT_DATA__") {
            return Err(StatsFetchError {
                status: Some(status),
                ..StatsFetchError::new(
                    StatsFetchErrorKind::HttpStatus,
                    format!("Stats page returned status {status}"),
                    is_retryable_status(status),
                )
            });
        }

        Ok((target, html))
    }

    /// Fetch the full multi-season collection. Mirrors TS
    /// `fetchAndScrapeStatsCollectionResult`. Retries up to `self.retry.max_attempts`
    /// times on retryable errors (429, 5xx, transient network).
    pub async fn fetch_stats_collection(
        &self,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<ScrapedStatsCollection, StatsFetchError> {
        let mut attempt: u32 = 0;
        let mut backoff_ms = self.retry.initial_backoff_ms;
        loop {
            attempt += 1;
            match self.fetch_stats_collection_once(username, platform).await {
                Ok(v) => return Ok(v),
                Err(e) if e.retryable && attempt < self.retry.max_attempts => {
                    tracing::warn!(
                        username,
                        attempt,
                        max = self.retry.max_attempts,
                        backoff_ms,
                        error = %e,
                        "stats fetch retryable error; backing off"
                    );
                    if backoff_ms > 0 {
                        tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
                    }
                    backoff_ms = (backoff_ms.saturating_mul(2)).min(self.retry.max_backoff_ms);
                }
                Err(e) => return Err(e),
            }
        }
    }

    async fn fetch_stats_collection_once(
        &self,
        username: &str,
        platform: StatsPlatform,
    ) -> Result<ScrapedStatsCollection, StatsFetchError> {
        let (target, html) = self.fetch_stats_page(username, platform).await?;
        let mut collection = scrape_html_stats_collection(&html);

        // If parsing the body returned nothing at all (empty profile + no seasons)
        // that's effectively a payload failure; surface it as retryable so the
        // outer loop can try again.
        let looks_empty = collection.season_catalog.is_empty()
            && collection.by_season.is_empty()
            && collection.latest.profile.username.is_empty();
        if looks_empty {
            return Err(StatsFetchError::new(
                StatsFetchErrorKind::InvalidPayload,
                "Scraped payload was empty",
                true,
            ));
        }

        // Preserve the searched username (TS comment: PlayStation may alias to
        // the linked Ubisoft canonical name).
        collection.latest.profile.username = username.to_string();
        for stats in collection.by_season.values_mut() {
            stats.profile.username = username.to_string();
        }

        attach_resolved_target(&mut collection, &target);
        Ok(collection)
    }

    /// Fetch a single season's stats (or latest). Mirrors TS `fetchAndScrapeStats`.
    pub async fn fetch_stats(
        &self,
        username: &str,
        platform: StatsPlatform,
        season_selector: Option<&str>,
    ) -> Result<ScrapedStats, StatsFetchError> {
        let collection = self.fetch_stats_collection(username, platform).await?;
        let requested = season_selector.map(str::trim).filter(|s| !s.is_empty());
        let Some(sel) = requested else {
            return Ok(collection.latest);
        };

        let Some(slug) = canonicalize_season_selector(sel, &collection.season_catalog) else {
            return Err(StatsFetchError {
                requested_season: Some(sel.to_string()),
                available_seasons: collection.season_catalog,
                ..StatsFetchError::new(
                    StatsFetchErrorKind::SeasonNotFound,
                    format!("Requested season \"{sel}\" was not found"),
                    false,
                )
            });
        };

        collection
            .by_season
            .get(&slug)
            .cloned()
            .ok_or_else(|| StatsFetchError {
                requested_season: Some(sel.to_string()),
                available_seasons: collection.season_catalog.clone(),
                ..StatsFetchError::new(
                    StatsFetchErrorKind::SeasonNotFound,
                    format!("Requested season \"{sel}\" is unavailable"),
                    false,
                )
            })
    }
}

fn attach_resolved_target(collection: &mut ScrapedStatsCollection, target: &ResolvedProfileTarget) {
    collection.latest.profile.profile_id = target.uuid.clone();
    collection.latest.profile.platform = target.platform.as_str().to_string();
    collection.latest.profile.profile_url = target.profile_url.clone();
    for stats in collection.by_season.values_mut() {
        stats.profile.profile_id = target.uuid.clone();
        stats.profile.platform = target.platform.as_str().to_string();
        stats.profile.profile_url = target.profile_url.clone();
    }
}

/// Minimal percent-encoding matching `encodeURIComponent` for plain ASCII usernames.
fn urlencoding_encode(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    for b in v.bytes() {
        let is_unreserved = b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~');
        if is_unreserved {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Convenience wrapper around a default `StatsClient`.
pub async fn fetch_stats(
    username: &str,
    platform: StatsPlatform,
    season_selector: Option<&str>,
) -> Result<ScrapedStats, StatsFetchError> {
    StatsClient::default()
        .fetch_stats(username, platform, season_selector)
        .await
}

/// Convenience wrapper around a default `StatsClient`.
pub async fn fetch_stats_collection(
    username: &str,
    platform: StatsPlatform,
) -> Result<ScrapedStatsCollection, StatsFetchError> {
    StatsClient::default()
        .fetch_stats_collection(username, platform)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uuid_regex_accepts_valid() {
        assert!(UUID_REGEX.is_match("aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee"));
    }

    #[test]
    fn uuid_regex_rejects_invalid() {
        assert!(!UUID_REGEX.is_match("not-a-uuid"));
    }

    #[test]
    fn parse_resolved_profile_url_decodes_username() {
        let (u, id) = parse_resolved_profile_url(
            "https://stats.cc/siege/Some%20Player/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
        )
        .unwrap();
        assert_eq!(u, "Some Player");
        assert_eq!(id, "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee");
    }

    #[test]
    fn percent_decode_basic() {
        assert_eq!(percent_decode("a%20b").as_deref(), Some("a b"));
    }
}
