//! Centralized matchmaking eligibility checks.

use diesel_async::AsyncPgConnection;

use crate::db::Game;
use crate::db::matchmaking_repos::MatchRepo;
use crate::db::models::GuildMatchmakingRules;
use crate::db::repos::{
    DiscordIdentityRepo, GuildMatchQuotaRepo, GuildMatchmakingRulesRepo, GuildMemberRow,
    GuildSettingsRepo, UserSettingsRepo,
};

pub struct EligibilityContext {
    pub guild_matchmaking_enabled: bool,
    pub rules: Option<GuildMatchmakingRules>,
    pub daily_match_limit: Option<i32>,
    pub matches_today: i64,
}

pub async fn load_eligibility(
    conn: &mut AsyncPgConnection,
    game: Game,
    guild_id: &str,
) -> Result<EligibilityContext, String> {
    let settings = GuildSettingsRepo::get(conn, guild_id, game)
        .await
        .map_err(|e| format!("guild settings: {e}"))?;
    let guild_matchmaking_enabled = settings
        .as_ref()
        .map(|s| s.matchmaking_enabled)
        .unwrap_or(true);

    let rules = GuildMatchmakingRulesRepo::get(conn, guild_id, game)
        .await
        .map_err(|e| format!("matchmaking rules: {e}"))?;

    let quota = GuildMatchQuotaRepo::get(conn, guild_id, game)
        .await
        .map_err(|e| format!("match quotas: {e}"))?;
    let matches_today = MatchRepo::count_today_for_guild(conn, game, guild_id)
        .await
        .map_err(|e| format!("match count: {e}"))?;

    Ok(EligibilityContext {
        guild_matchmaking_enabled,
        rules,
        daily_match_limit: quota.map(|q| q.daily_match_limit),
        matches_today,
    })
}

pub async fn user_matchmaking_enabled(
    conn: &mut AsyncPgConnection,
    discord_user_id: &str,
) -> Result<bool, String> {
    let settings = UserSettingsRepo::get(conn, discord_user_id)
        .await
        .map_err(|e| format!("user settings: {e}"))?;
    Ok(settings.map(|s| s.matchmaking_enabled).unwrap_or(true))
}

pub async fn check_queue_eligibility(
    conn: &mut AsyncPgConnection,
    game: Game,
    _guild_id: &str,
    discord_user_ids: &[String],
    members: &[GuildMemberRow],
    ctx: &EligibilityContext,
) -> Result<(), String> {
    if !ctx.guild_matchmaking_enabled {
        return Err("matchmaking is disabled for this server".into());
    }

    for id in discord_user_ids {
        if !user_matchmaking_enabled(conn, id).await? {
            return Err(format!("user {id} has matchmaking disabled"));
        }
    }

    if let Some(limit) = ctx.daily_match_limit.filter(|l| *l > 0)
        && ctx.matches_today >= limit as i64
    {
        return Err("daily match limit reached for this server".into());
    }

    if let Some(rules) = &ctx.rules {
        if let Some(min) = rules.min_elo.filter(|v| *v > 0) {
            for m in members {
                if m.internal_elo < min as f64 {
                    return Err(format!("player {} below min elo", m.username));
                }
            }
        }
        if let Some(max) = rules.max_elo.filter(|v| *v > 0) {
            for m in members {
                if m.internal_elo > max as f64 {
                    return Err(format!("player {} above max elo", m.username));
                }
            }
        }
        if let Some(platforms) = &rules.platforms {
            let allowed: std::collections::HashSet<_> =
                platforms.iter().map(|p| p.to_ascii_lowercase()).collect();
            if !allowed.is_empty() {
                for m in members {
                    if !allowed.contains(&m.platform.to_ascii_lowercase()) {
                        return Err(format!(
                            "player {} platform {} not allowed",
                            m.username, m.platform
                        ));
                    }
                }
            }
        }
        if rules.require_verified {
            for id in discord_user_ids {
                let links = DiscordIdentityRepo::find_by_discord(conn, Some(game), id)
                    .await
                    .map_err(|e| format!("identity lookup: {e}"))?;
                if links.is_empty() {
                    return Err(format!("user {id} is not verified (no linked account)"));
                }
            }
        }
        if rules.max_elo_gap > 0 {
            let min_elo = members
                .iter()
                .map(|m| m.internal_elo)
                .fold(f64::INFINITY, f64::min);
            let max_elo = members
                .iter()
                .map(|m| m.internal_elo)
                .fold(f64::NEG_INFINITY, f64::max);
            if max_elo - min_elo > rules.max_elo_gap as f64 {
                return Err(format!(
                    "elo gap {} exceeds max {}",
                    max_elo - min_elo,
                    rules.max_elo_gap
                ));
            }
        }
    }

    Ok(())
}

pub fn check_lobby_elo_gap(members: &[GuildMemberRow], max_gap: i32) -> Result<(), String> {
    if max_gap <= 0 || members.is_empty() {
        return Ok(());
    }
    let min_elo = members
        .iter()
        .map(|m| m.internal_elo)
        .fold(f64::INFINITY, f64::min);
    let max_elo = members
        .iter()
        .map(|m| m.internal_elo)
        .fold(f64::NEG_INFINITY, f64::max);
    if max_elo - min_elo > max_gap as f64 {
        return Err(format!(
            "lobby elo gap {} exceeds max {}",
            max_elo - min_elo,
            max_gap
        ));
    }
    Ok(())
}
