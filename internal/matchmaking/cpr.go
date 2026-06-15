// Package matchmaking implements the Parley matchmaking engine: Composite
// Performance Rating (CPR), Glicko-2 team balancing, eligibility rules, queue
// matching, and a background sweeper. The package mirrors src/matchmaking/*
// in the Rust engine-service and is split into pure-logic files (cpr.go,
// glicko.go) and DB-aware files (eligibility.go, players.go, queue.go,
// sweeper.go) that use the bun repositories under internal/repos.
package matchmaking

import "math"

// GlickoQ is the constant from Glicko-2's RD conversion. Mirrors
// GLICKO_Q in src/matchmaking/mod.rs.
const GlickoQ = 0.00575646273

// beta is the Glicko-2 skill spread constant used in team_win_probability.
// Mirrors BETA in src/matchmaking/mod.rs.
const beta = 200.0

// StatNorm is the population mean/std_dev for z-score normalization of a
// single stat. Mirrors StatNorm in src/matchmaking/mod.rs.
type StatNorm struct {
	Mean   float64
	StdDev float64
}

// PopulationNorms holds the per-stat normalization parameters derived from
// the guild roster's stat samples. Mirrors PopulationNorms in
// src/matchmaking/mod.rs.
type PopulationNorms struct {
	KD           StatNorm
	WinRate      StatNorm
	KPR          StatNorm
	MMR          StatNorm
	Kost         StatNorm
	SurvivalRate StatNorm
	HSPercentage StatNorm
}

// FromSamples computes the per-stat mean/std_dev across a list of
// RawPlayerStats samples. Returns zero-mean / unit-std_dev norms when
// samples is empty.
func (n PopulationNorms) FromSamples(samples []RawPlayerStats) PopulationNorms {
	return PopulationNorms{
		KD:           statNorm(statField(samples, func(s RawPlayerStats) float64 { return s.KD })),
		WinRate:      statNorm(statField(samples, func(s RawPlayerStats) float64 { return s.WinRate })),
		KPR:          statNorm(statField(samples, func(s RawPlayerStats) float64 { return s.KPR })),
		MMR:          statNorm(statField(samples, func(s RawPlayerStats) float64 { return s.MMR })),
		Kost:         statNorm(statField(samples, func(s RawPlayerStats) float64 { return s.Kost })),
		SurvivalRate: statNorm(statField(samples, func(s RawPlayerStats) float64 { return s.SurvivalRate })),
		HSPercentage: statNorm(statField(samples, func(s RawPlayerStats) float64 { return s.HSPercentage })),
	}
}

func statField(samples []RawPlayerStats, getter func(RawPlayerStats) float64) []float64 {
	out := make([]float64, len(samples))
	for i, s := range samples {
		out[i] = getter(s)
	}
	return out
}

// statNorm returns the (mean, std_dev) of values, with std_dev floored at
// machine epsilon to avoid division by zero. Returns mean=0, std_dev=1 for
// empty input, matching the Rust behavior.
func statNorm(values []float64) StatNorm {
	if len(values) == 0 {
		return StatNorm{Mean: 0, StdDev: 1}
	}
	n := float64(len(values))
	var sum float64
	for _, v := range values {
		sum += v
	}
	mean := sum / n
	var sqSum float64
	for _, v := range values {
		d := v - mean
		sqSum += d * d
	}
	variance := sqSum / n
	std := math.Sqrt(variance)
	if std < math.SmallestNonzeroFloat64 {
		std = math.SmallestNonzeroFloat64
	}
	return StatNorm{Mean: mean, StdDev: std}
}

// RawPlayerStats are the pre-normalization stat values sourced from
// upstream stat providers. Mirrors RawPlayerStats in src/matchmaking/mod.rs.
type RawPlayerStats struct {
	KD           float64
	WinRate      float64
	KPR          float64
	MMR          float64
	Kost         float64
	SurvivalRate float64
	HSPercentage float64
	TKPenalty    float64
}

// PlayerMatchStats are the normalized stat values used for CPR and team
// balance. Mirrors PlayerMatchStats in src/matchmaking/mod.rs.
type PlayerMatchStats struct {
	KD           float64
	WinRate      float64
	KPR          float64
	MMR          float64
	Kost         float64
	SurvivalRate float64
	HSPercentage float64
	TKPenalty    float64
}

// NewPlayerMatchStatsFromRaw normalizes a RawPlayerStats against the
// population norms and returns a PlayerMatchStats. The TKPenalty is
// normalized against (0, 1) since there is no population sample for it.
// Mirrors PlayerMatchStats::from_raw in src/matchmaking/mod.rs.
func NewPlayerMatchStatsFromRaw(raw RawPlayerStats, norms *PopulationNorms) PlayerMatchStats {
	return PlayerMatchStats{
		KD:           NormalizeStat(raw.KD, norms.KD.Mean, norms.KD.StdDev),
		WinRate:      NormalizeStat(raw.WinRate, norms.WinRate.Mean, norms.WinRate.StdDev),
		KPR:          NormalizeStat(raw.KPR, norms.KPR.Mean, norms.KPR.StdDev),
		MMR:          NormalizeStat(raw.MMR, norms.MMR.Mean, norms.MMR.StdDev),
		Kost:         NormalizeStat(raw.Kost, norms.Kost.Mean, norms.Kost.StdDev),
		SurvivalRate: NormalizeStat(raw.SurvivalRate, norms.SurvivalRate.Mean, norms.SurvivalRate.StdDev),
		HSPercentage: NormalizeStat(raw.HSPercentage, norms.HSPercentage.Mean, norms.HSPercentage.StdDev),
		TKPenalty:    NormalizeStat(raw.TKPenalty, 0, 1),
	}
}

// NeutralPlayerMatchStats returns a profile where every stat is 0.5 —
// the midpoint of the normalized range. Used when a player has no stat
// snapshot. Mirrors PlayerMatchStats::neutral in src/matchmaking/mod.rs.
func NeutralPlayerMatchStats() PlayerMatchStats {
	return PlayerMatchStats{
		KD: 0.5, WinRate: 0.5, KPR: 0.5, MMR: 0.5, Kost: 0.5,
		SurvivalRate: 0.5, HSPercentage: 0.5, TKPenalty: 0.5,
	}
}

// NormalizeStat clips a raw value to a [0, 1] range via z-score then
// affine rescaling. Returns 0.5 when the global std_dev is at or below
// machine epsilon. Mirrors normalize_stat in src/matchmaking/mod.rs.
func NormalizeStat(val, globalMean, globalStdDev float64) float64 {
	if globalStdDev <= math.SmallestNonzeroFloat64 {
		return 0.5
	}
	z := (val - globalMean) / globalStdDev
	if z < -3.0 {
		z = -3.0
	} else if z > 3.0 {
		z = 3.0
	}
	return (z + 3.0) / 6.0
}

// CalculateCPR returns the weighted Composite Performance Rating for a
// normalized stat block. Weights match those in src/matchmaking/mod.rs.
func CalculateCPR(s PlayerMatchStats) float64 {
	return 0.22*s.KD +
		0.22*s.WinRate +
		0.15*s.KPR +
		0.12*s.MMR +
		0.12*s.Kost +
		0.08*s.SurvivalRate +
		0.06*s.HSPercentage -
		0.03*s.TKPenalty
}

// CalculateDecayedCPR returns an exponentially time-decayed CPR average
// over a slice of historical CPR values, where the most recent entry
// carries the highest weight. lambda is the decay base; values in (0, 1]
// weight the past less. Mirrors calculate_decayed_cpr in
// src/matchmaking/mod.rs.
func CalculateDecayedCPR(historicalCPRs []float64, lambda float64) float64 {
	if len(historicalCPRs) == 0 {
		return 0
	}
	n := len(historicalCPRs)
	var numerator, denominator float64
	for i, cpr := range historicalCPRs {
		t := i + 1
		weight := math.Pow(lambda, float64(n-t))
		numerator += weight * cpr
		denominator += weight
	}
	if denominator == 0 {
		return 0
	}
	return numerator / denominator
}

// gPhi is the Glicko-2 g(phi) reduction function. Mirrors g_phi in
// src/matchmaking/mod.rs.
func gPhi(phi float64) float64 {
	return 1.0 / math.Sqrt(1.0+3.0*phi*phi/(math.Pi*math.Pi))
}

// expectedScore returns the Glicko-2 expected outcome for player (mu) vs
// opponent (mu_j, phi_j). Mirrors expected_score in src/matchmaking/mod.rs.
func expectedScore(mu, muJ, phiJ float64) float64 {
	return 1.0 / (1.0 + math.Exp(-gPhi(phiJ)*(mu-muJ)/400.0))
}

// UpdateRating applies a single Glicko-2 update for a player against one
// opponent, modulated by a CPR-based performance delta. The returned
// (newMu, newPhi) replace the player's rating. Mirrors update_rating in
// src/matchmaking/mod.rs.
func UpdateRating(
	mu, phi, opponentMu, opponentPhi, baseOutcome, playerCPR, expectedLobbyCPR float64,
) (newMu, newPhi float64) {
	const kPerf = 0.15
	performanceDelta := kPerf * (playerCPR - expectedLobbyCPR)
	sJ := baseOutcome + performanceDelta
	if sJ < -0.2 {
		sJ = -0.2
	} else if sJ > 1.2 {
		sJ = 1.2
	}

	gJ := gPhi(opponentPhi)
	eJ := expectedScore(mu, opponentMu, opponentPhi)

	vInv := GlickoQ * GlickoQ * gJ * gJ * eJ * (1.0 - eJ)
	if vInv < math.SmallestNonzeroFloat64 {
		vInv = math.SmallestNonzeroFloat64
	}
	v := 1.0 / vInv
	newPhi = 1.0 / math.Sqrt(1.0/(phi*phi)+1.0/v)
	diff := gJ * (sJ - eJ)
	newMu = mu + (GlickoQ * newPhi * newPhi * diff)
	return
}
