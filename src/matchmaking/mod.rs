//! CPR + Glicko team-balance engine (pure logic, no I/O).

pub mod eligibility;
pub mod players;
pub mod queue;
pub mod sweeper;

use std::f64::consts::PI;

const GLICKO_Q: f64 = 0.00575646273;
const BETA: f64 = 200.0;

/// Population mean/std for z-score normalization.
#[derive(Debug, Clone, Copy, Default, serde::Serialize, serde::Deserialize)]
pub struct StatNorm {
    pub mean: f64,
    pub std_dev: f64,
}

#[derive(Debug, Clone, Copy, Default, serde::Serialize, serde::Deserialize)]
pub struct PopulationNorms {
    pub kd: StatNorm,
    pub win_rate: StatNorm,
    pub kpr: StatNorm,
    pub mmr: StatNorm,
    pub kost: StatNorm,
    pub survival_rate: StatNorm,
    pub hs_percentage: StatNorm,
}

impl PopulationNorms {
    pub fn from_samples(samples: &[RawPlayerStats]) -> Self {
        Self {
            kd: stat_norm(samples.iter().map(|s| s.kd)),
            win_rate: stat_norm(samples.iter().map(|s| s.win_rate)),
            kpr: stat_norm(samples.iter().map(|s| s.kpr)),
            mmr: stat_norm(samples.iter().map(|s| s.mmr)),
            kost: stat_norm(samples.iter().map(|s| s.kost)),
            survival_rate: stat_norm(samples.iter().map(|s| s.survival_rate)),
            hs_percentage: stat_norm(samples.iter().map(|s| s.hs_percentage)),
        }
    }
}

fn stat_norm<I: Iterator<Item = f64>>(values: I) -> StatNorm {
    let vals: Vec<f64> = values.collect();
    if vals.is_empty() {
        return StatNorm {
            mean: 0.0,
            std_dev: 1.0,
        };
    }
    let n = vals.len() as f64;
    let mean = vals.iter().sum::<f64>() / n;
    let variance = vals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
    let std_dev = variance.sqrt().max(f64::EPSILON);
    StatNorm { mean, std_dev }
}

/// Raw stat inputs before normalization.
#[derive(Debug, Clone, Copy, Default)]
pub struct RawPlayerStats {
    pub kd: f64,
    pub win_rate: f64,
    pub kpr: f64,
    pub mmr: f64,
    pub kost: f64,
    pub survival_rate: f64,
    pub hs_percentage: f64,
    pub tk_penalty: f64,
}

#[derive(Debug, Clone)]
pub struct PlayerMatchStats {
    pub kd: f64,
    pub win_rate: f64,
    pub kpr: f64,
    pub mmr: f64,
    pub kost: f64,
    pub survival_rate: f64,
    pub hs_percentage: f64,
    pub tk_penalty: f64,
}

impl PlayerMatchStats {
    pub fn from_raw(raw: RawPlayerStats, norms: &PopulationNorms) -> Self {
        Self {
            kd: normalize_stat(raw.kd, norms.kd.mean, norms.kd.std_dev),
            win_rate: normalize_stat(raw.win_rate, norms.win_rate.mean, norms.win_rate.std_dev),
            kpr: normalize_stat(raw.kpr, norms.kpr.mean, norms.kpr.std_dev),
            mmr: normalize_stat(raw.mmr, norms.mmr.mean, norms.mmr.std_dev),
            kost: normalize_stat(raw.kost, norms.kost.mean, norms.kost.std_dev),
            survival_rate: normalize_stat(
                raw.survival_rate,
                norms.survival_rate.mean,
                norms.survival_rate.std_dev,
            ),
            hs_percentage: normalize_stat(
                raw.hs_percentage,
                norms.hs_percentage.mean,
                norms.hs_percentage.std_dev,
            ),
            tk_penalty: normalize_stat(raw.tk_penalty, 0.0, 1.0),
        }
    }

    /// Neutral profile when no snapshot exists (maps to ~0.5 per normalized stat).
    pub fn neutral() -> Self {
        Self {
            kd: 0.5,
            win_rate: 0.5,
            kpr: 0.5,
            mmr: 0.5,
            kost: 0.5,
            survival_rate: 0.5,
            hs_percentage: 0.5,
            tk_penalty: 0.5,
        }
    }
}

pub fn normalize_stat(val: f64, global_mean: f64, global_std_dev: f64) -> f64 {
    if global_std_dev <= f64::EPSILON {
        return 0.5;
    }
    let z = (val - global_mean) / global_std_dev;
    let z_clipped = z.clamp(-3.0, 3.0);
    (z_clipped + 3.0) / 6.0
}

pub fn calculate_cpr(stats: &PlayerMatchStats) -> f64 {
    (0.22 * stats.kd)
        + (0.22 * stats.win_rate)
        + (0.15 * stats.kpr)
        + (0.12 * stats.mmr)
        + (0.12 * stats.kost)
        + (0.08 * stats.survival_rate)
        + (0.06 * stats.hs_percentage)
        - (0.03 * stats.tk_penalty)
}

#[allow(dead_code)]
pub fn calculate_decayed_cpr(historical_cprs: &[f64], lambda: f64) -> f64 {
    if historical_cprs.is_empty() {
        return 0.0;
    }
    let mut numerator = 0.0;
    let mut denominator = 0.0;
    let n = historical_cprs.len() as i32;
    for (t, &cpr) in historical_cprs.iter().enumerate() {
        let t_idx = (t + 1) as i32;
        let weight = lambda.powi(n - t_idx);
        numerator += weight * cpr;
        denominator += weight;
    }
    numerator / denominator
}

fn g_phi(phi: f64) -> f64 {
    1.0 / (1.0 + (3.0 * phi.powi(2)) / PI.powi(2)).sqrt()
}

fn expected_score(mu: f64, mu_j: f64, phi_j: f64) -> f64 {
    1.0 / (1.0 + (-g_phi(phi_j) * (mu - mu_j) / 400.0).exp())
}

pub fn update_rating(
    mu: f64,
    phi: f64,
    opponent_mu: f64,
    opponent_phi: f64,
    base_outcome: f64,
    player_cpr: f64,
    expected_lobby_cpr: f64,
) -> (f64, f64) {
    let k_perf = 0.15;
    let performance_delta = k_perf * (player_cpr - expected_lobby_cpr);
    let s_j = (base_outcome + performance_delta).clamp(-0.2, 1.2);

    let g_j = g_phi(opponent_phi);
    let e_j = expected_score(mu, opponent_mu, opponent_phi);

    let v_inv = GLICKO_Q.powi(2) * g_j.powi(2) * e_j * (1.0 - e_j);
    let v = 1.0 / v_inv.max(f64::EPSILON);
    let new_phi = 1.0 / (1.0 / phi.powi(2) + 1.0 / v).sqrt();
    let diff = g_j * (s_j - e_j);
    let new_mu = mu + (GLICKO_Q * new_phi.powi(2) * diff);
    (new_mu, new_phi)
}

pub struct TeamRoster {
    pub members: Vec<(f64, f64)>,
}

impl TeamRoster {
    fn avg_mu(&self) -> f64 {
        if self.members.is_empty() {
            return 1500.0;
        }
        self.members.iter().map(|(mu, _)| mu).sum::<f64>() / self.members.len() as f64
    }
}

pub fn team_win_probability(team_a: &TeamRoster, team_b: &TeamRoster) -> f64 {
    let mu_a = team_a.avg_mu();
    let mu_b = team_b.avg_mu();

    let mut sum_phi_sq = 0.0;
    for (_, phi) in &team_a.members {
        sum_phi_sq += phi.powi(2);
    }
    for (_, phi) in &team_b.members {
        sum_phi_sq += phi.powi(2);
    }

    let denominator = (2.0 * BETA.powi(2) + sum_phi_sq).sqrt();
    if denominator == 0.0 {
        return 0.5;
    }

    let exponent = -(mu_a - mu_b) / denominator;
    1.0 / (1.0 + 10_f64.powf(exponent))
}

#[derive(Debug, Clone)]
pub struct RatedPlayer {
    pub mu: f64,
    pub phi: f64,
    pub cpr: f64,
}

#[derive(Debug, Clone)]
pub struct TeamPartition {
    pub team_a: Vec<usize>,
    pub team_b: Vec<usize>,
    pub win_probability: f64,
    pub balance_gap: f64,
}

/// Split `players` into two teams of `team_size`, minimizing win-probability
/// deviation from 0.5.
pub fn partition_teams(players: &[RatedPlayer], team_size: usize) -> Option<TeamPartition> {
    let n = players.len();
    if n != team_size * 2 || n == 0 {
        return None;
    }

    let mut best: Option<TeamPartition> = None;
    for combo in combinations_including_first(n, team_size) {
        let mut team_a_idx = combo;
        let mut team_b_idx: Vec<usize> = (0..n).filter(|i| !team_a_idx.contains(i)).collect();

        // Canonical ordering: avoid mirror duplicates.
        if team_b_idx[0] < team_a_idx[0] {
            std::mem::swap(&mut team_a_idx, &mut team_b_idx);
        }

        let roster_a = build_roster(players, &team_a_idx);
        let roster_b = build_roster(players, &team_b_idx);
        let win_prob = team_win_probability(&roster_a, &roster_b);

        let cpr_a: f64 = team_a_idx.iter().map(|&i| players[i].cpr).sum();
        let cpr_b: f64 = team_b_idx.iter().map(|&i| players[i].cpr).sum();
        let balance_gap = (cpr_a - cpr_b).abs();

        let fairness = (win_prob - 0.5).abs();
        let replace = match &best {
            None => true,
            Some(b) => {
                let b_fair = (b.win_probability - 0.5).abs();
                fairness < b_fair - f64::EPSILON
                    || ((fairness - b_fair).abs() <= f64::EPSILON && balance_gap < b.balance_gap)
            }
        };

        if replace {
            best = Some(TeamPartition {
                team_a: team_a_idx,
                team_b: team_b_idx,
                win_probability: win_prob,
                balance_gap,
            });
        }
    }

    best
}

fn build_roster(players: &[RatedPlayer], indices: &[usize]) -> TeamRoster {
    TeamRoster {
        members: indices
            .iter()
            .map(|&i| (players[i].mu, players[i].phi))
            .collect(),
    }
}

/// All combinations of `k` elements from `0..n` that include index `0`.
fn combinations_including_first(n: usize, k: usize) -> Vec<Vec<usize>> {
    if k == 0 || n == 0 {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut combo = vec![0];
    extend_combo(&mut combo, 1, n, k, &mut out);
    out
}

fn extend_combo(
    current: &mut Vec<usize>,
    start: usize,
    n: usize,
    k: usize,
    out: &mut Vec<Vec<usize>>,
) {
    if current.len() == k {
        out.push(current.clone());
        return;
    }
    let remaining = k - current.len();
    for i in start..=n.saturating_sub(remaining) {
        current.push(i);
        extend_combo(current, i + 1, n, k, out);
        current.pop();
    }
}

/// Parse `"5v5"` → `5`. Falls back to `5` when unset or unparseable.
pub fn parse_team_size(format: Option<&str>) -> usize {
    let Some(fmt) = format else {
        return 5;
    };
    let trimmed = fmt.trim().to_ascii_lowercase();
    if let Some(head) = trimmed.split('v').next()
        && let Ok(n) = head.parse::<usize>()
        && n > 0
    {
        return n;
    }
    5
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_stat_clamps_outliers() {
        assert!((normalize_stat(100.0, 1.0, 1.0) - 1.0).abs() < f64::EPSILON);
        assert!((normalize_stat(1.0, 1.0, 0.0) - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn cpr_weights_sum_positive() {
        let stats = PlayerMatchStats::neutral();
        let cpr = calculate_cpr(&stats);
        assert!(cpr > 0.4 && cpr < 0.6);
    }

    #[test]
    fn partition_ten_players_is_fair() {
        let players: Vec<RatedPlayer> = (0..10)
            .map(|i| RatedPlayer {
                mu: 1500.0 + (i as f64) * 50.0,
                phi: 350.0,
                cpr: 0.4 + (i as f64) * 0.02,
            })
            .collect();

        let part = partition_teams(&players, 5).expect("partition");
        assert_eq!(part.team_a.len(), 5);
        assert_eq!(part.team_b.len(), 5);
        assert!((part.win_probability - 0.5).abs() < 0.15);
    }

    #[test]
    fn parse_team_size_handles_formats() {
        assert_eq!(parse_team_size(Some("5v5")), 5);
        assert_eq!(parse_team_size(Some("3v3")), 3);
        assert_eq!(parse_team_size(None), 5);
    }

    #[test]
    fn team_win_probability_equal_teams() {
        let roster = TeamRoster {
            members: vec![(1500.0, 350.0); 5],
        };
        let prob = team_win_probability(&roster, &roster);
        assert!((prob - 0.5).abs() < 0.01);
    }
}
