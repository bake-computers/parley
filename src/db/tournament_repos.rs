//! Repositories for tournament lifecycle and brackets.

use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};

use crate::db::Game;
use crate::db::models::{
    BracketMatch, NewBracketMatch, NewTournament, NewTournamentTeam, NewTournamentTeamRoster,
    Tournament, TournamentTeam, TournamentTeamRoster,
};
use crate::db::repos::{normalize_username, now_ms};
use crate::db::schema::{bracket_matches, tournament_team_rosters, tournament_teams, tournaments};

pub const TOURNAMENT_STATUS_OPEN: &str = "open";
pub const TOURNAMENT_STATUS_IN_PROGRESS: &str = "in_progress";
pub const TOURNAMENT_STATUS_COMPLETED: &str = "completed";
pub const TOURNAMENT_STATUS_CANCELLED: &str = "cancelled";

pub const TEAM_STATUS_REGISTERED: &str = "registered";
pub const TEAM_STATUS_ACTIVE: &str = "active";
pub const TEAM_STATUS_ELIMINATED: &str = "eliminated";
pub const TEAM_STATUS_WITHDRAWN: &str = "withdrawn";

pub const BRACKET_STATUS_PENDING: &str = "pending";
pub const BRACKET_STATUS_READY: &str = "ready";
pub const BRACKET_STATUS_IN_PROGRESS: &str = "in_progress";
pub const BRACKET_STATUS_COMPLETED: &str = "completed";

pub struct TournamentRepo;

impl TournamentRepo {
    pub async fn create(
        conn: &mut AsyncPgConnection,
        row: NewTournament<'_>,
    ) -> QueryResult<Tournament> {
        diesel::insert_into(tournaments::table)
            .values(&row)
            .returning(Tournament::as_returning())
            .get_result(conn)
            .await
    }

    pub async fn get(
        conn: &mut AsyncPgConnection,
        game: Game,
        tournament_id: i32,
    ) -> QueryResult<Option<Tournament>> {
        tournaments::table
            .filter(tournaments::id.eq(tournament_id))
            .filter(tournaments::game.eq(game))
            .select(Tournament::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn list_for_guild(
        conn: &mut AsyncPgConnection,
        game: Game,
        guild_id: &str,
        status: Option<&str>,
        limit: i64,
    ) -> QueryResult<Vec<Tournament>> {
        let mut q = tournaments::table
            .filter(tournaments::game.eq(game))
            .filter(tournaments::created_by_guild_id.eq(guild_id))
            .into_boxed();
        if let Some(s) = status.filter(|v| !v.is_empty()) {
            q = q.filter(tournaments::status.eq(s));
        }
        q.order(tournaments::created_at.desc())
            .limit(limit)
            .select(Tournament::as_select())
            .load(conn)
            .await
    }

    pub async fn update_status(
        conn: &mut AsyncPgConnection,
        game: Game,
        tournament_id: i32,
        status: &str,
        started_at: Option<i64>,
        completed_at: Option<i64>,
        winner_entry_id: Option<i32>,
    ) -> QueryResult<Option<Tournament>> {
        let now = now_ms();
        diesel::update(
            tournaments::table
                .filter(tournaments::id.eq(tournament_id))
                .filter(tournaments::game.eq(game)),
        )
        .set((
            tournaments::status.eq(status),
            tournaments::started_at.eq(started_at),
            tournaments::completed_at.eq(completed_at),
            tournaments::winner_entry_id.eq(winner_entry_id),
            tournaments::updated_at.eq(now),
        ))
        .returning(Tournament::as_returning())
        .get_result(conn)
        .await
        .optional()
    }
}

pub struct TournamentTeamRepo;

impl TournamentTeamRepo {
    pub async fn register(
        conn: &mut AsyncPgConnection,
        row: NewTournamentTeam<'_>,
        roster: Vec<NewTournamentTeamRoster<'_>>,
    ) -> QueryResult<(TournamentTeam, Vec<TournamentTeamRoster>)> {
        let team = diesel::insert_into(tournament_teams::table)
            .values(&row)
            .returning(TournamentTeam::as_returning())
            .get_result(conn)
            .await?;

        let mut saved = Vec::with_capacity(roster.len());
        for mut r in roster {
            r.team_id = team.id;
            let entry = diesel::insert_into(tournament_team_rosters::table)
                .values(&r)
                .returning(TournamentTeamRoster::as_returning())
                .get_result(conn)
                .await?;
            saved.push(entry);
        }
        Ok((team, saved))
    }

    pub async fn list_for_tournament(
        conn: &mut AsyncPgConnection,
        tournament_id: i32,
    ) -> QueryResult<Vec<TournamentTeam>> {
        tournament_teams::table
            .filter(tournament_teams::tournament_id.eq(tournament_id))
            .filter(tournament_teams::status.ne(TEAM_STATUS_WITHDRAWN))
            .order(tournament_teams::seed_number.asc())
            .select(TournamentTeam::as_select())
            .load(conn)
            .await
    }

    pub async fn get(
        conn: &mut AsyncPgConnection,
        game: Game,
        team_id: i32,
    ) -> QueryResult<Option<TournamentTeam>> {
        tournament_teams::table
            .filter(tournament_teams::id.eq(team_id))
            .filter(tournament_teams::game.eq(game))
            .select(TournamentTeam::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn withdraw(
        conn: &mut AsyncPgConnection,
        game: Game,
        team_id: i32,
    ) -> QueryResult<Option<TournamentTeam>> {
        let now = now_ms();
        diesel::update(
            tournament_teams::table
                .filter(tournament_teams::id.eq(team_id))
                .filter(tournament_teams::game.eq(game)),
        )
        .set((
            tournament_teams::status.eq(TEAM_STATUS_WITHDRAWN),
            tournament_teams::updated_at.eq(now),
        ))
        .returning(TournamentTeam::as_returning())
        .get_result(conn)
        .await
        .optional()
    }

    pub async fn update_seeds(
        conn: &mut AsyncPgConnection,
        team_id: i32,
        seed_number: i32,
        status: &str,
    ) -> QueryResult<()> {
        let now = now_ms();
        diesel::update(tournament_teams::table.find(team_id))
            .set((
                tournament_teams::seed_number.eq(Some(seed_number)),
                tournament_teams::status.eq(status),
                tournament_teams::updated_at.eq(now),
            ))
            .execute(conn)
            .await?;
        Ok(())
    }

    pub async fn eliminate(conn: &mut AsyncPgConnection, team_id: i32) -> QueryResult<()> {
        let now = now_ms();
        diesel::update(tournament_teams::table.find(team_id))
            .set((
                tournament_teams::status.eq(TEAM_STATUS_ELIMINATED),
                tournament_teams::eliminated_at.eq(Some(now)),
                tournament_teams::updated_at.eq(now),
            ))
            .execute(conn)
            .await?;
        Ok(())
    }

    pub fn normalize_team_name(name: &str) -> String {
        normalize_username(name)
    }
}

pub struct TournamentRosterRepo;

impl TournamentRosterRepo {
    pub async fn for_team(
        conn: &mut AsyncPgConnection,
        team_id: i32,
    ) -> QueryResult<Vec<TournamentTeamRoster>> {
        tournament_team_rosters::table
            .filter(tournament_team_rosters::team_id.eq(team_id))
            .order(tournament_team_rosters::slot.asc())
            .select(TournamentTeamRoster::as_select())
            .load(conn)
            .await
    }

    pub async fn for_tournament(
        conn: &mut AsyncPgConnection,
        tournament_id: i32,
    ) -> QueryResult<Vec<TournamentTeamRoster>> {
        tournament_team_rosters::table
            .filter(tournament_team_rosters::tournament_id.eq(tournament_id))
            .order((
                tournament_team_rosters::team_id.asc(),
                tournament_team_rosters::slot.asc(),
            ))
            .select(TournamentTeamRoster::as_select())
            .load(conn)
            .await
    }

    pub async fn replace_for_team(
        conn: &mut AsyncPgConnection,
        team_id: i32,
        roster: Vec<NewTournamentTeamRoster<'_>>,
    ) -> QueryResult<Vec<TournamentTeamRoster>> {
        diesel::delete(
            tournament_team_rosters::table.filter(tournament_team_rosters::team_id.eq(team_id)),
        )
        .execute(conn)
        .await?;

        let mut saved = Vec::with_capacity(roster.len());
        for r in roster {
            let entry = diesel::insert_into(tournament_team_rosters::table)
                .values(&r)
                .returning(TournamentTeamRoster::as_returning())
                .get_result(conn)
                .await?;
            saved.push(entry);
        }
        Ok(saved)
    }
}

pub struct BracketMatchRepo;

impl BracketMatchRepo {
    pub async fn insert_batch(
        conn: &mut AsyncPgConnection,
        rows: Vec<NewBracketMatch<'_>>,
    ) -> QueryResult<Vec<BracketMatch>> {
        let mut saved = Vec::with_capacity(rows.len());
        for row in rows {
            let m = diesel::insert_into(bracket_matches::table)
                .values(&row)
                .returning(BracketMatch::as_returning())
                .get_result(conn)
                .await?;
            saved.push(m);
        }
        Ok(saved)
    }

    pub async fn list_for_tournament(
        conn: &mut AsyncPgConnection,
        tournament_id: i32,
    ) -> QueryResult<Vec<BracketMatch>> {
        bracket_matches::table
            .filter(bracket_matches::tournament_id.eq(tournament_id))
            .order((
                bracket_matches::bracket.asc(),
                bracket_matches::round_number.asc(),
                bracket_matches::match_number.asc(),
            ))
            .select(BracketMatch::as_select())
            .load(conn)
            .await
    }

    pub async fn get(
        conn: &mut AsyncPgConnection,
        game: Game,
        bracket_match_id: i32,
    ) -> QueryResult<Option<BracketMatch>> {
        bracket_matches::table
            .filter(bracket_matches::id.eq(bracket_match_id))
            .filter(bracket_matches::game.eq(game))
            .select(BracketMatch::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn update_result(
        conn: &mut AsyncPgConnection,
        bracket_match_id: i32,
        winner_team_id: i32,
        loser_team_id: i32,
    ) -> QueryResult<Option<BracketMatch>> {
        let now = now_ms();
        diesel::update(bracket_matches::table.find(bracket_match_id))
            .set((
                bracket_matches::status.eq(BRACKET_STATUS_COMPLETED),
                bracket_matches::winner_team_id.eq(Some(winner_team_id)),
                bracket_matches::loser_team_id.eq(Some(loser_team_id)),
                bracket_matches::updated_at.eq(now),
            ))
            .returning(BracketMatch::as_returning())
            .get_result(conn)
            .await
            .optional()
    }

    pub async fn set_team_slot(
        conn: &mut AsyncPgConnection,
        bracket_match_id: i32,
        slot: &str,
        team_id: i32,
    ) -> QueryResult<()> {
        let now = now_ms();
        if slot == "a" {
            diesel::update(bracket_matches::table.find(bracket_match_id))
                .set((
                    bracket_matches::team_a_id.eq(Some(team_id)),
                    bracket_matches::updated_at.eq(now),
                ))
                .execute(conn)
                .await?;
        } else {
            diesel::update(bracket_matches::table.find(bracket_match_id))
                .set((
                    bracket_matches::team_b_id.eq(Some(team_id)),
                    bracket_matches::updated_at.eq(now),
                ))
                .execute(conn)
                .await?;
        }
        Ok(())
    }

    pub async fn set_custom_match(
        conn: &mut AsyncPgConnection,
        bracket_match_id: i32,
        custom_match_id: i32,
    ) -> QueryResult<()> {
        let now = now_ms();
        diesel::update(bracket_matches::table.find(bracket_match_id))
            .set((
                bracket_matches::custom_match_id.eq(Some(custom_match_id)),
                bracket_matches::status.eq(BRACKET_STATUS_IN_PROGRESS),
                bracket_matches::updated_at.eq(now),
            ))
            .execute(conn)
            .await?;
        Ok(())
    }

    pub async fn mark_ready_when_both_teams(
        conn: &mut AsyncPgConnection,
        bracket_match_id: i32,
    ) -> QueryResult<()> {
        let bm: BracketMatch = bracket_matches::table
            .find(bracket_match_id)
            .select(BracketMatch::as_select())
            .first(conn)
            .await?;
        if bm.team_a_id.is_some() && bm.team_b_id.is_some() && bm.status == BRACKET_STATUS_PENDING {
            let now = now_ms();
            diesel::update(bracket_matches::table.find(bracket_match_id))
                .set((
                    bracket_matches::status.eq(BRACKET_STATUS_READY),
                    bracket_matches::updated_at.eq(now),
                ))
                .execute(conn)
                .await?;
        }
        Ok(())
    }
}
