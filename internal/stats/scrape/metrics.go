package scrape

import "math"

// RoundTo rounds the given float64 to n decimal places, matching
// TypeScript's Number(x.toFixed(n)) behavior.
func RoundTo(value float64, decimals int) float64 {
	factor := math.Pow(10, float64(decimals))
	return math.Round(value*factor) / factor
}

// CalculateKost estimates KOST% (midpoint between lower and upper bounds).
// Ported from the TypeScript calculateKost helper.
//
//	lower = max(killRounds, survivalRounds, tradedRounds)
//	upper = min(roundsPlayed, killRounds + survivalRounds + tradedRounds)
//	estimate = (lower + upper) / 2
//	KOST% = estimate / roundsPlayed * 100
func CalculateKost(stats *RankedStats) float64 {
	roundsPlayed := float64(stats.RoundsPlayed)
	if roundsPlayed <= 0 {
		return 0
	}

	killRounds := float64(stats.KillRounds)
	survivalRounds := float64(stats.SurvivalRounds)
	tradedRounds := float64(stats.TradedRounds)

	lower := math.Max(killRounds, math.Max(survivalRounds, tradedRounds))
	upper := math.Min(roundsPlayed, killRounds+survivalRounds+tradedRounds)
	estimate := (lower + upper) / 2.0

	return RoundTo((estimate/roundsPlayed)*100, 2)
}

// KostLowerBound returns the pessimistic KOST% estimate.
func KostLowerBound(stats *RankedStats) float64 {
	roundsPlayed := float64(stats.RoundsPlayed)
	if roundsPlayed <= 0 {
		return 0
	}
	lower := math.Max(float64(stats.KillRounds), math.Max(float64(stats.SurvivalRounds), float64(stats.TradedRounds)))
	return RoundTo((lower/roundsPlayed)*100, 2)
}

// KostUpperBound returns the optimistic KOST% estimate, clamped by total rounds.
func KostUpperBound(stats *RankedStats) float64 {
	roundsPlayed := float64(stats.RoundsPlayed)
	if roundsPlayed <= 0 {
		return 0
	}
	upper := math.Min(roundsPlayed, float64(stats.KillRounds)+float64(stats.SurvivalRounds)+float64(stats.TradedRounds))
	return RoundTo((upper/roundsPlayed)*100, 2)
}
