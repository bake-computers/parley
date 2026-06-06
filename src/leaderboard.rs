use redis::AsyncCommands;
use redis::aio::ConnectionManager;

use crate::backends::Game;
use crate::scrape::ScrapedStats;

const LEADERBOARD_KEY_PREFIX: &str = "lb";

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum LeaderboardKind {
    Elo,
    WinRate,
    RankPoints,
}

impl LeaderboardKind {
    pub fn as_str(self) -> &'static str {
        match self {
            LeaderboardKind::Elo => "elo",
            LeaderboardKind::WinRate => "winrate",
            LeaderboardKind::RankPoints => "rp",
        }
    }
}

#[derive(Clone, Debug)]
pub struct LeaderboardEntry {
    pub player_id: String,
    pub rank: i64,
    pub score: f64,
}

#[derive(Clone)]
pub struct LeaderboardStore {
    conn: ConnectionManager,
}

impl LeaderboardStore {
    pub fn new(conn: ConnectionManager) -> Self {
        Self { conn }
    }

    fn key(&self, game: Game, guild_id: &str, kind: LeaderboardKind) -> String {
        let scope = if guild_id.is_empty() {
            "global"
        } else {
            guild_id
        };
        format!(
            "{l}:{g}:{s}:{k}",
            l = LEADERBOARD_KEY_PREFIX,
            g = game.as_str(),
            s = scope,
            k = kind.as_str()
        )
    }

    pub async fn touch(&self, game: Game, guild_id: &str, player_id: &str, stats: &ScrapedStats) {
        let mut conn = self.conn.clone();
        let elo_score = stats.ranked_stats.rank_points as f64;

        let elo_key = self.key(game, guild_id, LeaderboardKind::Elo);
        let wr_key = self.key(game, guild_id, LeaderboardKind::WinRate);
        let rp_key = self.key(game, guild_id, LeaderboardKind::RankPoints);

        let _: () = redis::pipe()
            .atomic()
            .zadd(&elo_key, player_id, elo_score)
            .zadd(&wr_key, player_id, stats.ranked_stats.win_rate)
            .zadd(&rp_key, player_id, stats.ranked_stats.rank_points as f64)
            .query_async(&mut conn)
            .await
            .unwrap_or(());
    }

    pub async fn top(
        &self,
        game: Game,
        guild_id: &str,
        kind: LeaderboardKind,
        limit: isize,
        offset: isize,
    ) -> Vec<LeaderboardEntry> {
        let key = self.key(game, guild_id, kind);
        let mut conn = self.conn.clone();
        let items: Vec<(String, f64)> = conn
            .zrevrange_withscores(&key, offset, offset + limit - 1)
            .await
            .unwrap_or_default();

        items
            .into_iter()
            .enumerate()
            .map(|(i, (player_id, score))| LeaderboardEntry {
                player_id,
                rank: offset as i64 + i as i64 + 1,
                score,
            })
            .collect()
    }

    pub async fn player_rank(
        &self,
        game: Game,
        guild_id: &str,
        kind: LeaderboardKind,
        player_id: &str,
    ) -> Option<LeaderboardEntry> {
        let key = self.key(game, guild_id, kind);
        let mut conn = self.conn.clone();

        let rank: Option<i64> = conn.zrevrank(&key, player_id).await.ok()?;
        let score: Option<f64> = conn.zscore(&key, player_id).await.ok()?;

        match (rank, score) {
            (Some(r), Some(s)) => Some(LeaderboardEntry {
                player_id: player_id.to_string(),
                rank: r + 1,
                score: s,
            }),
            _ => None,
        }
    }

    pub async fn count(&self, game: Game, guild_id: &str, kind: LeaderboardKind) -> i64 {
        let key = self.key(game, guild_id, kind);
        let mut conn = self.conn.clone();
        conn.zcard(&key).await.unwrap_or(0)
    }

    pub async fn remove(&self, game: Game, guild_id: &str, player_id: &str) {
        let mut conn = self.conn.clone();
        for kind in &[
            LeaderboardKind::Elo,
            LeaderboardKind::WinRate,
            LeaderboardKind::RankPoints,
        ] {
            let key = self.key(game, guild_id, *kind);
            let _: () = conn.zrem(&key, player_id).await.unwrap_or(());
        }
    }
}
