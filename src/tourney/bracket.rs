//! Bracket topology generation for single- and double-elimination tournaments.

use diesel::SelectableHelper;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;

use crate::db::Game;
use crate::db::models::NewBracketMatch;
use crate::db::models::TournamentTeam;
use crate::db::repos::now_ms;
use crate::db::tournament_repos::TournamentTeamRepo;
use crate::db::tournament_repos::{
    BRACKET_STATUS_PENDING, BRACKET_STATUS_READY, TEAM_STATUS_ACTIVE,
};

use super::seeding::standard_bracket_order;

#[derive(Debug, Clone)]
pub struct BracketDraft {
    pub bracket: String,
    pub round_number: i32,
    pub match_number: i32,
    pub team_a_id: Option<i32>,
    pub team_b_id: Option<i32>,
    pub winner_to_key: Option<(String, i32, i32)>,
    pub winner_to_slot: Option<String>,
    pub loser_to_key: Option<(String, i32, i32)>,
    pub loser_to_slot: Option<String>,
}

fn next_power_of_two(n: usize) -> usize {
    n.next_power_of_two().max(2)
}

pub fn generate_single_elimination(teams: &[TournamentTeam]) -> Vec<BracketDraft> {
    let n = teams.len();
    if n < 2 {
        return Vec::new();
    }

    let bracket_size = next_power_of_two(n);
    let rounds = (bracket_size as f64).log2() as i32;
    let mut order = standard_bracket_order(bracket_size);
    while order.len() < bracket_size {
        order.push(usize::MAX);
    }

    let mut seeded: Vec<Option<i32>> = vec![None; bracket_size];
    for (i, team) in teams.iter().enumerate() {
        if i < bracket_size {
            seeded[order[i]] = Some(team.id);
        }
    }

    let mut drafts = Vec::new();
    let mut round_matches: Vec<Vec<i32>> = vec![Vec::new(); rounds as usize];

    let r1_count = bracket_size / 2;
    for m in 0..r1_count {
        let a_idx = m * 2;
        let b_idx = m * 2 + 1;
        let match_number = (m + 1) as i32;
        round_matches[0].push(match_number);
        drafts.push(BracketDraft {
            bracket: "winners".into(),
            round_number: 1,
            match_number,
            team_a_id: seeded[a_idx],
            team_b_id: seeded[b_idx],
            winner_to_key: if rounds > 1 {
                Some(("winners".into(), 2, ((m / 2) + 1) as i32))
            } else {
                None
            },
            winner_to_slot: if rounds > 1 {
                Some(if m % 2 == 0 { "a".into() } else { "b".into() })
            } else {
                None
            },
            loser_to_key: None,
            loser_to_slot: None,
        });
    }

    let mut matches_in_round = r1_count / 2;
    for round in 2..=rounds {
        let r = round as usize;
        round_matches[r - 1] = Vec::new();
        for m in 0..matches_in_round {
            let match_number = (m + 1) as i32;
            round_matches[r - 1].push(match_number);
            let winner_to = if round < rounds {
                Some(("winners".into(), round + 1, ((m / 2) + 1) as i32))
            } else {
                None
            };
            drafts.push(BracketDraft {
                bracket: "winners".into(),
                round_number: round,
                match_number,
                team_a_id: None,
                team_b_id: None,
                winner_to_key: winner_to.clone(),
                winner_to_slot: winner_to.map(|_| if m % 2 == 0 { "a".into() } else { "b".into() }),
                loser_to_key: None,
                loser_to_slot: None,
            });
        }
        matches_in_round /= 2;
    }

    drafts
}

pub fn generate_double_elimination(teams: &[TournamentTeam]) -> Vec<BracketDraft> {
    let mut drafts = generate_single_elimination(teams);
    let n = teams.len();
    if n < 2 {
        return drafts;
    }

    let bracket_size = next_power_of_two(n);
    let winners_rounds = (bracket_size as f64).log2() as i32;

    let losers_round1_matches = bracket_size / 4;
    for m in 0..losers_round1_matches.max(1) {
        drafts.push(BracketDraft {
            bracket: "losers".into(),
            round_number: 1,
            match_number: (m + 1) as i32,
            team_a_id: None,
            team_b_id: None,
            winner_to_key: Some(("losers".into(), 2, 1)),
            winner_to_slot: Some(if m == 0 { "a".into() } else { "b".into() }),
            loser_to_key: None,
            loser_to_slot: None,
        });
    }

    drafts.push(BracketDraft {
        bracket: "losers".into(),
        round_number: 2,
        match_number: 1,
        team_a_id: None,
        team_b_id: None,
        winner_to_key: Some(("grand_final".into(), 1, 1)),
        winner_to_slot: Some("b".into()),
        loser_to_key: None,
        loser_to_slot: None,
    });

    if let Some(last_winners) = drafts
        .iter()
        .filter(|d| d.bracket == "winners")
        .max_by_key(|d| (d.round_number, d.match_number))
    {
        if let Some(idx) = drafts.iter().position(|d| {
            d.bracket == last_winners.bracket
                && d.round_number == last_winners.round_number
                && d.match_number == last_winners.match_number
        }) {
            drafts[idx].loser_to_key = Some(("losers".into(), 2, 1));
            drafts[idx].loser_to_slot = Some("a".into());
        }
    }

    for m in 0..(bracket_size / 2) {
        if let Some(idx) = drafts.iter().position(|d| {
            d.bracket == "winners" && d.round_number == 1 && d.match_number == (m + 1) as i32
        }) {
            let loser_round = 1;
            let loser_match = (m / 2 + 1) as i32;
            drafts[idx].loser_to_key = Some(("losers".into(), loser_round, loser_match));
            drafts[idx].loser_to_slot = Some(if m % 2 == 0 { "a".into() } else { "b".into() });
        }
    }

    drafts.push(BracketDraft {
        bracket: "grand_final".into(),
        round_number: 1,
        match_number: 1,
        team_a_id: None,
        team_b_id: None,
        winner_to_key: None,
        winner_to_slot: None,
        loser_to_key: None,
        loser_to_slot: None,
    });

    let _ = winners_rounds;
    drafts
}

pub async fn persist_bracket(
    conn: &mut diesel_async::AsyncPgConnection,
    game: Game,
    tournament_id: i32,
    drafts: Vec<BracketDraft>,
) -> Result<Vec<crate::db::models::BracketMatch>, diesel::result::Error> {
    use crate::db::tournament_repos::BracketMatchRepo;

    let now = now_ms();
    let mut key_to_id: std::collections::HashMap<(String, i32, i32), i32> =
        std::collections::HashMap::new();

    let mut inserted = Vec::new();
    for draft in &drafts {
        let status = if draft.team_a_id.is_some() && draft.team_b_id.is_some() {
            BRACKET_STATUS_READY
        } else {
            BRACKET_STATUS_PENDING
        };
        let row = NewBracketMatch {
            game,
            tournament_id,
            bracket: &draft.bracket,
            round_number: draft.round_number,
            match_number: draft.match_number,
            status,
            team_a_id: draft.team_a_id,
            team_b_id: draft.team_b_id,
            winner_team_id: None,
            loser_team_id: None,
            winner_to_match_id: None,
            winner_to_slot: None,
            loser_to_match_id: None,
            loser_to_slot: None,
            custom_match_id: None,
            created_at: now,
            updated_at: now,
        };
        let saved = diesel::insert_into(crate::db::schema::bracket_matches::table)
            .values(&row)
            .returning(crate::db::models::BracketMatch::as_returning())
            .get_result(conn)
            .await?;
        key_to_id.insert(
            (
                draft.bracket.clone(),
                draft.round_number,
                draft.match_number,
            ),
            saved.id,
        );
        inserted.push(saved);
    }

    for (i, draft) in drafts.iter().enumerate() {
        let winner_to = draft
            .winner_to_key
            .clone()
            .and_then(|k| key_to_id.get(&k).copied());
        let loser_to = draft
            .loser_to_key
            .clone()
            .and_then(|k| key_to_id.get(&k).copied());
        if winner_to.is_some() || loser_to.is_some() {
            diesel::update(crate::db::schema::bracket_matches::table.find(inserted[i].id))
                .set((
                    crate::db::schema::bracket_matches::winner_to_match_id.eq(winner_to),
                    crate::db::schema::bracket_matches::winner_to_slot
                        .eq(draft.winner_to_slot.as_deref()),
                    crate::db::schema::bracket_matches::loser_to_match_id.eq(loser_to),
                    crate::db::schema::bracket_matches::loser_to_slot
                        .eq(draft.loser_to_slot.as_deref()),
                    crate::db::schema::bracket_matches::updated_at.eq(now),
                ))
                .execute(conn)
                .await?;
        }
    }

    let refreshed = BracketMatchRepo::list_for_tournament(conn, tournament_id).await?;
    Ok(refreshed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::TournamentTeam;

    fn fake_team(id: i32) -> TournamentTeam {
        TournamentTeam {
            id,
            game: Game::R6,
            tournament_id: 1,
            guild_id: "g".into(),
            channel_id: "c".into(),
            captain_discord_user_id: "u".into(),
            team_name: format!("T{id}"),
            team_name_normalized: format!("t{id}"),
            status: "active".into(),
            seed_number: Some(id),
            stack_balance_total: 1.0,
            stack_balance_average: 1.0,
            joined_at: 0,
            eliminated_at: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn single_elim_four_teams_produces_three_matches() {
        let teams: Vec<_> = (1..=4).map(fake_team).collect();
        let drafts = generate_single_elimination(&teams);
        assert_eq!(drafts.len(), 3);
    }
}

pub async fn seed_and_activate_teams(
    conn: &mut diesel_async::AsyncPgConnection,
    teams: &mut [TournamentTeam],
) -> Result<(), diesel::result::Error> {
    super::seeding::seed_teams(teams);
    for (i, team) in teams.iter().enumerate() {
        TournamentTeamRepo::update_seeds(conn, team.id, (i + 1) as i32, TEAM_STATUS_ACTIVE).await?;
    }
    Ok(())
}
