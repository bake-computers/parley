//! Tournament team seeding.

use crate::db::models::TournamentTeam;

pub fn seed_teams(teams: &mut [TournamentTeam]) {
    teams.sort_by(|a, b| {
        b.stack_balance_average
            .partial_cmp(&a.stack_balance_average)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
}

pub fn standard_bracket_order(n: usize) -> Vec<usize> {
    if n <= 1 {
        return vec![0];
    }
    let mut seeds = vec![0usize];
    let mut size = 1usize;
    while size < n {
        let mut next = Vec::with_capacity(size * 2);
        for &s in &seeds {
            next.push(s);
            next.push(size * 2 - 1 - s);
        }
        seeds = next;
        size *= 2;
    }
    seeds.into_iter().take(n).collect()
}
