//! KOST and other derived metrics from a ranked stats record.

use crate::scrape::RankedStats;

/// Round the given f64 to `n` decimals, like TS `Number(x.toFixed(n))`.
pub(crate) fn round_to(value: f64, decimals: u32) -> f64 {
    let factor = 10f64.powi(decimals as i32);
    (value * factor).round() / factor
}

/// Estimate KOST% (midpoint between lower and upper bounds). Ported from the
/// TypeScript `calculateKost` helper.
///
/// ```text
/// lower = max(killRounds, survivalRounds, tradedRounds)
/// upper = min(roundsPlayed, killRounds + survivalRounds + tradedRounds)
/// estimate = (lower + upper) / 2
/// KOST% = estimate / roundsPlayed * 100
/// ```
pub fn calculate_kost(stats: &RankedStats) -> f64 {
    let rounds_played = stats.rounds_played as f64;
    if rounds_played <= 0.0 {
        return 0.0;
    }

    let kill_rounds = stats.kill_rounds as f64;
    let survival_rounds = stats.survival_rounds as f64;
    let traded_rounds = stats.traded_rounds as f64;

    let lower = kill_rounds.max(survival_rounds).max(traded_rounds);
    let upper = rounds_played.min(kill_rounds + survival_rounds + traded_rounds);
    let estimate = (lower + upper) / 2.0;

    round_to((estimate / rounds_played) * 100.0, 2)
}

/// KOST lower bound (pessimistic estimate).
pub fn kost_lower_bound(stats: &RankedStats) -> f64 {
    let rounds_played = stats.rounds_played as f64;
    if rounds_played <= 0.0 {
        return 0.0;
    }
    let lower = (stats.kill_rounds as f64)
        .max(stats.survival_rounds as f64)
        .max(stats.traded_rounds as f64);
    round_to((lower / rounds_played) * 100.0, 2)
}

/// KOST upper bound (optimistic estimate, clamped by total rounds).
pub fn kost_upper_bound(stats: &RankedStats) -> f64 {
    let rounds_played = stats.rounds_played as f64;
    if rounds_played <= 0.0 {
        return 0.0;
    }
    let upper = rounds_played
        .min(stats.kill_rounds as f64 + stats.survival_rounds as f64 + stats.traded_rounds as f64);
    round_to((upper / rounds_played) * 100.0, 2)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> RankedStats {
        RankedStats {
            rounds_played: 100,
            kill_rounds: 40,
            survival_rounds: 30,
            traded_rounds: 10,
            ..Default::default()
        }
    }

    #[test]
    fn zero_rounds_returns_zero() {
        let stats = RankedStats::default();
        assert_eq!(calculate_kost(&stats), 0.0);
        assert_eq!(kost_lower_bound(&stats), 0.0);
        assert_eq!(kost_upper_bound(&stats), 0.0);
    }

    #[test]
    fn kost_midpoint_matches_ts() {
        let s = sample();
        // lower = max(40, 30, 10) = 40 => 40%
        // upper = min(100, 80) = 80 => 80%
        // midpoint = 60%
        assert_eq!(kost_lower_bound(&s), 40.0);
        assert_eq!(kost_upper_bound(&s), 80.0);
        assert_eq!(calculate_kost(&s), 60.0);
    }

    #[test]
    fn upper_is_clamped_by_total_rounds() {
        let s = RankedStats {
            rounds_played: 10,
            kill_rounds: 8,
            survival_rounds: 8,
            traded_rounds: 8,
            ..Default::default()
        };
        // sum = 24, rounds = 10 => upper = 100%
        assert_eq!(kost_upper_bound(&s), 100.0);
    }
}