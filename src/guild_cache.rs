//! Redis-backed guild roster + normalization aggregate cache.

use redis::AsyncCommands;
use redis::aio::ConnectionManager;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::db::Game;
use crate::db::repos::GuildMemberRow;
use crate::matchmaking::PopulationNorms;

const MEMBERS_TTL_SECS: u64 = 60;
const NORMS_TTL_SECS: u64 = 300;
const BUILD_TEAMS_TTL_SECS: u64 = 30;

fn members_key(game: Game, guild_id: &str) -> String {
    format!("gm:{}:{}", game.as_str(), guild_id)
}

fn norms_key(game: Game, guild_id: &str) -> String {
    format!("gn:{}:{}", game.as_str(), guild_id)
}

fn build_teams_key(game: Game, guild_id: &str, ids_hash: &str) -> String {
    format!("bt:{}:{}:{}", game.as_str(), guild_id, ids_hash)
}

#[derive(Clone)]
pub struct GuildCache {
    redis: Option<ConnectionManager>,
    memory: Arc<RwLock<MemoryGuildCache>>,
}

#[derive(Default)]
struct MemoryGuildCache {
    members: HashMap<String, Vec<GuildMemberRow>>,
    norms: HashMap<String, PopulationNorms>,
}

impl GuildCache {
    pub fn redis(conn: ConnectionManager) -> Self {
        Self {
            redis: Some(conn),
            memory: Arc::new(RwLock::new(MemoryGuildCache::default())),
        }
    }

    pub fn in_memory() -> Self {
        Self {
            redis: None,
            memory: Arc::new(RwLock::new(MemoryGuildCache::default())),
        }
    }

    pub async fn get_members(&self, game: Game, guild_id: &str) -> Option<Vec<GuildMemberRow>> {
        let key = members_key(game, guild_id);
        if let Some(redis) = &self.redis {
            let mut conn = redis.clone();
            let raw: Option<String> = conn.get(&key).await.ok().flatten();
            if let Some(json) = raw
                && let Ok(rows) = serde_json::from_str::<Vec<GuildMemberRow>>(&json)
            {
                return Some(rows);
            }
        }
        let guard = self.memory.read().await;
        guard.members.get(&key).cloned()
    }

    pub async fn set_members(&self, game: Game, guild_id: &str, rows: &[GuildMemberRow]) {
        let key = members_key(game, guild_id);
        if let Some(redis) = &self.redis
            && let Ok(json) = serde_json::to_string(rows)
        {
            let mut conn = redis.clone();
            let _: Result<(), _> = conn.set_ex(&key, json, MEMBERS_TTL_SECS).await;
        }
        let mut guard = self.memory.write().await;
        guard.members.insert(key, rows.to_vec());
    }

    pub async fn invalidate_members(&self, game: Game, guild_id: &str) {
        let key = members_key(game, guild_id);
        if let Some(redis) = &self.redis {
            let mut conn = redis.clone();
            let _: Result<(), _> = conn.del(&key).await;
        }
        let mut guard = self.memory.write().await;
        guard.members.remove(&key);
    }

    pub async fn get_norms(&self, game: Game, guild_id: &str) -> Option<PopulationNorms> {
        let key = norms_key(game, guild_id);
        if let Some(redis) = &self.redis {
            let mut conn = redis.clone();
            let raw: Option<String> = conn.get(&key).await.ok().flatten();
            if let Some(json) = raw
                && let Ok(norms) = serde_json::from_str::<PopulationNorms>(&json)
            {
                return Some(norms);
            }
        }
        let guard = self.memory.read().await;
        guard.norms.get(&key).copied()
    }

    pub async fn set_norms(&self, game: Game, guild_id: &str, norms: PopulationNorms) {
        let key = norms_key(game, guild_id);
        if let Some(redis) = &self.redis
            && let Ok(json) = serde_json::to_string(&norms)
        {
            let mut conn = redis.clone();
            let _: Result<(), _> = conn.set_ex(&key, json, NORMS_TTL_SECS).await;
        }
        let mut guard = self.memory.write().await;
        guard.norms.insert(key, norms);
    }

    pub async fn invalidate_norms(&self, game: Game, guild_id: &str) {
        let key = norms_key(game, guild_id);
        if let Some(redis) = &self.redis {
            let mut conn = redis.clone();
            let _: Result<(), _> = conn.del(&key).await;
        }
        let mut guard = self.memory.write().await;
        guard.norms.remove(&key);
    }

    pub async fn invalidate_guild(&self, game: Game, guild_id: &str) {
        self.invalidate_members(game, guild_id).await;
        self.invalidate_norms(game, guild_id).await;
    }

    pub async fn get_build_teams_cached<T: serde::de::DeserializeOwned>(
        &self,
        game: Game,
        guild_id: &str,
        ids_hash: &str,
    ) -> Option<T> {
        let key = build_teams_key(game, guild_id, ids_hash);
        if let Some(redis) = &self.redis {
            let mut conn = redis.clone();
            let raw: Option<String> = conn.get(&key).await.ok().flatten();
            if let Some(json) = raw {
                return serde_json::from_str(&json).ok();
            }
        }
        None
    }

    pub async fn set_build_teams_cached<T: serde::Serialize>(
        &self,
        game: Game,
        guild_id: &str,
        ids_hash: &str,
        value: &T,
    ) {
        let key = build_teams_key(game, guild_id, ids_hash);
        if let Some(redis) = &self.redis
            && let Ok(json) = serde_json::to_string(value)
        {
            let mut conn = redis.clone();
            let _: Result<(), _> = conn.set_ex(&key, json, BUILD_TEAMS_TTL_SECS).await;
        }
    }
}
