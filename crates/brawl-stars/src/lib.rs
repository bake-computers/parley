//! Brawl Stars API client.
//!
//! Thin async wrapper around the official Brawl Stars API
//! (`https://api.brawlstars.com/v1`). Requires an API key obtained from
//! <https://developer.brawlstars.com> and a server with a whitelisted IP.

use reqwest::Client;
use serde::Deserialize;
use thiserror::Error;

/// Configuration for the Brawl Stars API client.
#[derive(Clone, Debug)]
pub struct BrawlStarsConfig {
    pub api_key: String,
    pub base_url: String,
}

impl BrawlStarsConfig {
    /// Read configuration from environment variables.
    ///
    /// Required: `BRAWL_STARS_API_KEY`.
    /// Optional: `BRAWL_STARS_BASE_URL` (defaults to the official API).
    pub fn from_env() -> Result<Self, std::env::VarError> {
        let api_key = std::env::var("BRAWL_STARS_API_KEY")?;
        let base_url = std::env::var("BRAWL_STARS_BASE_URL")
            .unwrap_or_else(|_| "https://api.brawlstars.com/v1".to_string());
        Ok(Self { api_key, base_url })
    }
}

/// Async client for the Brawl Stars API.
#[derive(Clone)]
pub struct BrawlStarsClient {
    http: Client,
    config: BrawlStarsConfig,
}

impl BrawlStarsClient {
    pub fn new(config: BrawlStarsConfig) -> Self {
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .connect_timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap_or_default();
        Self { http, config }
    }

    /// Fetch a player profile by tag (e.g. `#2YQ8VJGP`).
    pub async fn get_player(&self, tag: &str) -> Result<PlayerProfile, BrawlStarsError> {
        let url = format!("{}/players/{}", self.config.base_url, encode_tag(tag));
        let resp = self.get(&url).await?;
        let status = resp.status().as_u16();
        if status == 200 {
            let body = resp.bytes().await.map_err(|e| BrawlStarsError::Network(e.to_string()))?;
            let profile: PlayerProfile =
                serde_json::from_slice(&body).map_err(|e| BrawlStarsError::Api {
                    status,
                    message: format!("failed to parse player profile: {e}"),
                })?;
            return Ok(profile);
        }
        Err(map_status(status, &resp.text().await.unwrap_or_default()))
    }

    /// Fetch a player's recent battle log.
    pub async fn get_battlelog(&self, tag: &str) -> Result<BattleLog, BrawlStarsError> {
        let url = format!(
            "{}/players/{}/battlelog",
            self.config.base_url,
            encode_tag(tag)
        );
        let resp = self.get(&url).await?;
        let status = resp.status().as_u16();
        if status == 200 {
            let body = resp.bytes().await.map_err(|e| BrawlStarsError::Network(e.to_string()))?;
            let log: BattleLog =
                serde_json::from_slice(&body).map_err(|e| BrawlStarsError::Api {
                    status,
                    message: format!("failed to parse battlelog: {e}"),
                })?;
            return Ok(log);
        }
        Err(map_status(status, &resp.text().await.unwrap_or_default()))
    }

    async fn get(&self, url: &str) -> Result<reqwest::Response, BrawlStarsError> {
        self.http
            .get(url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .send()
            .await
            .map_err(|e| BrawlStarsError::Network(e.to_string()))
    }
}

fn map_status(status: u16, body: &str) -> BrawlStarsError {
    match status {
        404 => BrawlStarsError::PlayerNotFound,
        429 => BrawlStarsError::RateLimited,
        403 => BrawlStarsError::Unauthorized,
        _ => BrawlStarsError::Api {
            status,
            message: body.to_string(),
        },
    }
}

/// URL-encode a Brawl Stars player tag (`#` → `%23`).
pub fn encode_tag(tag: &str) -> String {
    tag.replace('#', "%23")
}

#[derive(Debug, Error)]
pub enum BrawlStarsError {
    #[error("player not found")]
    PlayerNotFound,
    #[error("rate limited")]
    RateLimited,
    #[error("unauthorized (invalid API key or IP not whitelisted)")]
    Unauthorized,
    #[error("network error: {0}")]
    Network(String),
    #[error("api error (status {status}): {message}")]
    Api { status: u16, message: String },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerProfile {
    pub tag: String,
    pub name: String,
    #[serde(default)]
    pub trophies: i32,
    #[serde(default)]
    pub highest_trophies: i32,
    #[serde(default)]
    pub exp_level: i32,
    #[serde(default)]
    pub club: Option<ClubInfo>,
    #[serde(default)]
    pub brawlers: Vec<BrawlerEntry>,
}

impl PlayerProfile {
    pub fn brawlers_count(&self) -> i32 {
        self.brawlers.len() as i32
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClubInfo {
    pub tag: Option<String>,
    pub name: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrawlerEntry {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub trophies: i32,
    #[serde(default)]
    pub highest_trophies: i32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleLog {
    #[serde(default)]
    pub items: Vec<BattleLogEntry>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleLogEntry {
    #[serde(default)]
    pub battle_time: String,
    pub event: Option<BattleEvent>,
    pub battle: Option<BattleResult>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleEvent {
    pub id: Option<i64>,
    pub mode: Option<String>,
    pub map: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleResult {
    pub mode: Option<String>,
    pub result: Option<String>,
    pub duration: Option<i32>,
    pub trophy_change: Option<i32>,
    pub star_player: Option<bool>,
    #[serde(rename = "type")]
    pub battle_type: Option<String>,
}
