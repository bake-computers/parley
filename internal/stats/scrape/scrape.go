package scrape

// scrape.go — HTML + Nuxt payload parsing. Pure (no network I/O).
//
// Parses the __NUXT_DATA__ JSON from stats.cc HTML pages and extracts
// player profiles, ranked stats, season catalogs, and derived metrics.

import (
	"sort"
	"strings"

	gojson "github.com/goccy/go-json"
)

const kostDescription = "Estimated KOST% from aggregated match summaries (no round-level K/O/S/T flags in payload)"

// ExtractNuxtPayload pulls the __NUXT_DATA__ JSON string out of an HTML document.
func ExtractNuxtPayload(html string) (string, bool) {
	idPos := strings.Index(html, `id="__NUXT_DATA__"`)
	if idPos < 0 {
		idPos = strings.Index(html, `id='__NUXT_DATA__'`)
	}
	if idPos < 0 {
		return "", false
	}
	rest := html[idPos:]
	contentStart := strings.Index(rest, ">")
	if contentStart < 0 {
		return "", false
	}
	contentStart += idPos + 1
	contentEnd := strings.Index(html[contentStart:], "</script>")
	if contentEnd < 0 {
		return "", false
	}
	contentEnd += contentStart
	return strings.TrimSpace(html[contentStart:contentEnd]), true
}

// num extracts a float64 from an any value (handles float64, string-parse, bool).
func num(v any) float64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return val
	case string:
		var f float64
		_ = gojson.Unmarshal([]byte(val), &f)
		return f
	case bool:
		if val {
			return 1
		}
		return 0
	default:
		return 0
	}
}

// numInt32 extracts an int32 from an any value.
func numInt32(v any) int32 {
	return int32(num(v))
}

// strField extracts a string from an any value, returning empty string if nil.
func strField(v any) string {
	if v == nil {
		return ""
	}
	s, _ := v.(string)
	return s
}

// nonemptyStr extracts a non-empty string, returning "" if nil or empty.
func nonemptyStr(v any) string {
	s := strField(v)
	if s == "" {
		return ""
	}
	return s
}

// findProfileAndConstantsIndices scans the payload for the profile and constants objects.
func findProfileAndConstantsIndices(payload []any) (profileIdx, constantsIdx int, ok bool) {
	pi, ci := -1, -1
	for i, item := range payload {
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if pi < 0 {
			if _, hasUser := obj["username"]; hasUser {
				if _, hasRanked := obj["ranked_season_records"]; hasRanked {
					if _, hasModes := obj["season_mode_records"]; hasModes {
						pi = i
					}
				}
			}
		}
		if ci < 0 {
			if _, hasTiers := obj["rank_tiers"]; hasTiers {
				if _, hasRanks := obj["ranks"]; hasRanks {
					if _, hasSeasons := obj["seasons"]; hasSeasons {
						ci = i
					}
				}
			}
		}
		if pi >= 0 && ci >= 0 {
			break
		}
	}
	if pi < 0 || ci < 0 {
		return -1, -1, false
	}
	return pi, ci, true
}

func seasonDisplayFn(slug string, seasonsMeta any, resolver *NuxtResolver) string {
	meta := resolver.Field(seasonsMeta, slug)
	d := nonemptyStr(resolver.Field(meta, "display"))
	if d == "" {
		return slug
	}
	return d
}

func seasonStartedAtFn(slug string, seasonsMeta any, resolver *NuxtResolver) string {
	meta := resolver.Field(seasonsMeta, slug)
	return strField(resolver.Field(meta, "started_at"))
}

func sortSeasonSlugsByStartDesc(slugs []string, seasonsMeta any, resolver *NuxtResolver) {
	sort.Slice(slugs, func(i, j int) bool {
		ls := seasonStartedAtFn(slugs[i], seasonsMeta, resolver)
		rs := seasonStartedAtFn(slugs[j], seasonsMeta, resolver)
		if ls == rs {
			return slugs[j] < slugs[i]
		}
		return rs < ls
	})
}

func buildSeasonCatalog(rankedSeasons, seasonsMeta any, resolver *NuxtResolver) []SeasonCatalogEntry {
	resolved := resolver.Resolve(rankedSeasons)
	obj := AsObject(resolved)
	if obj == nil {
		return nil
	}
	slugs := make([]string, 0, len(obj))
	for k := range obj {
		slugs = append(slugs, k)
	}
	sortSeasonSlugsByStartDesc(slugs, seasonsMeta, resolver)
	catalog := make([]SeasonCatalogEntry, len(slugs))
	for i, slug := range slugs {
		catalog[i] = SeasonCatalogEntry{
			Slug:      slug,
			Display:   seasonDisplayFn(slug, seasonsMeta, resolver),
			StartedAt: seasonStartedAtFn(slug, seasonsMeta, resolver),
		}
	}
	return catalog
}

func rankLabel(rankSlug string, ranks, rankTiers any, resolver *NuxtResolver) (display, tier string) {
	if rankSlug == "" {
		return "Unknown", "Unknown"
	}
	rankEntry := resolver.Field(ranks, rankSlug)
	d := nonemptyStr(resolver.Field(rankEntry, "display"))
	if d == "" {
		d = rankSlug
	}
	tierSlug := nonemptyStr(resolver.Field(rankEntry, "tier"))
	if tierSlug == "" {
		return d, "Unknown"
	}
	t := nonemptyStr(resolver.Field(resolver.Field(rankTiers, tierSlug), "display"))
	if t == "" {
		t = tierSlug
	}
	return d, t
}

func keyMatchesPlaylist(key, pl string) bool {
	const prefix = `"playlist":"`
	pos := strings.Index(key, prefix)
	if pos < 0 {
		return false
	}
	rest := key[pos+len(prefix):]
	return len(rest) > len(pl) && rest[:len(pl)] == pl && rest[len(pl)] == '"'
}

func extractMatchesByPlaylist(resolver *NuxtResolver, playlist string) []any {
	for _, item := range resolver.Payload() {
		obj := AsObject(item)
		if obj == nil {
			continue
		}
		for key, value := range obj {
			if !strings.Contains(key, `"matches"`) {
				continue
			}
			if playlist != "" && !keyMatchesPlaylist(key, playlist) {
				continue
			}
			resolvedQuery := resolver.Resolve(value)
			arr := AsArray(resolvedQuery)
			if len(arr) == 0 {
				continue
			}
			first := resolver.Resolve(arr[0])
			queryMap := AsObject(first)
			if queryMap == nil {
				continue
			}
			pagesRaw, ok := queryMap["pages"]
			if !ok {
				continue
			}
			pages := resolver.Resolve(pagesRaw)
			pagesArr := AsArray(pages)
			if len(pagesArr) == 0 {
				continue
			}
			firstPage := resolver.Resolve(pagesArr[0])
			firstPageArr := AsArray(firstPage)
			if len(firstPageArr) == 0 {
				continue
			}
			out := make([]any, 0, len(firstPageArr))
			for _, mRaw := range firstPageArr {
				m := resolver.Resolve(mRaw)
				if IsObject(m) {
					out = append(out, m)
				}
			}
			return out
		}
	}
	return nil
}

type matchRoundTotals struct {
	roundsPlayed      int32
	survivalRounds    int32
	tradedRounds      int32
	openingKillRounds int32
	killRounds        int32
}

func summarizeMatchRounds(resolver *NuxtResolver, matches []any) matchRoundTotals {
	var t matchRoundTotals
	for _, m := range matches {
		s := resolver.Field(m, "player_summary")
		if s == nil {
			continue
		}
		rounds := numInt32(resolver.Field(s, "rounds"))
		t.roundsPlayed += rounds
		t.survivalRounds += numInt32(resolver.Field(s, "round_survivals"))
		t.tradedRounds += numInt32(resolver.Field(s, "trades"))
		t.openingKillRounds += numInt32(resolver.Field(s, "opening_kills"))
		kills := numInt32(resolver.Field(s, "kills"))
		kills2k := numInt32(resolver.Field(s, "kills_2k"))
		kills3k := numInt32(resolver.Field(s, "kills_3k"))
		kills4k := numInt32(resolver.Field(s, "kills_4k"))
		kills5k := numInt32(resolver.Field(s, "kills_5k"))
		roundsWithKill := kills - kills2k - 2*kills3k - 3*kills4k - 4*kills5k
		if roundsWithKill < 0 {
			roundsWithKill = 0
		}
		if roundsWithKill > rounds {
			roundsWithKill = rounds
		}
		t.killRounds += roundsWithKill
	}
	return t
}

func baseProfile(profile any, resolver *NuxtResolver) StatsProfile {
	username := nonemptyStr(resolver.Field(profile, "username"))
	if username == "" {
		username = "Unknown"
	}
	return StatsProfile{
		Username: username,
		Level:    numInt32(resolver.Field(profile, "level")),
	}
}

func toScraped(profile StatsProfile, ranked RankedStats) ScrapedStats {
	return ScrapedStats{
		Profile: profile,
		CalculatedMetrics: CalculatedMetrics{
			KOST:            CalculateKost(&ranked),
			KOSTLowerBound:  KostLowerBound(&ranked),
			KOSTUpperBound:  KostUpperBound(&ranked),
			KOSTDescription: kostDescription,
		},
		RankedStats: ranked,
	}
}

func buildRankedForSeason(
	resolver *NuxtResolver,
	rankedSeasons, seasonModeRecords, seasonsMeta, ranks, rankTiers any,
	seasonSlug string,
) RankedStats {
	currentSeason := resolver.Field(rankedSeasons, seasonSlug)
	currentRankSlug := nonemptyStr(resolver.Field(currentSeason, "rank"))
	peakRankSlug := nonemptyStr(resolver.Field(currentSeason, "max_rank"))
	currentRank, currentRankTier := rankLabel(currentRankSlug, ranks, rankTiers, resolver)
	peakRank, peakRankTier := rankLabel(peakRankSlug, ranks, rankTiers, resolver)

	var allTimePeakSeason string
	var allTimePeakRecord any
	allTimePeakPoints := int32(-1)
	if seasonsObj := AsObject(resolver.Resolve(rankedSeasons)); seasonsObj != nil {
		for slug, recRaw := range seasonsObj {
			rec := resolver.Resolve(recRaw)
			pts := numInt32(resolver.Field(rec, "max_rank_points"))
			if pts > allTimePeakPoints {
				allTimePeakPoints = pts
				allTimePeakSeason = slug
				allTimePeakRecord = rec
			}
		}
	}
	allTimePeakSlug := nonemptyStr(resolver.Field(allTimePeakRecord, "max_rank"))
	allTimePeakRank, allTimePeakRankTier := rankLabel(allTimePeakSlug, ranks, rankTiers, resolver)

	seasonModesOpt := resolver.Field(seasonModeRecords, seasonSlug)
	var modeRecord any
	if r := resolver.Field(seasonModesOpt, "ranked-bomb"); r != nil && IsObject(r) {
		modeRecord = r
	} else if smObj := AsObject(seasonModesOpt); smObj != nil {
		for ms, recRaw := range smObj {
			if strings.Contains(ms, "ranked") {
				r := resolver.Resolve(recRaw)
				if IsObject(r) {
					modeRecord = r
					break
				}
			}
		}
	}

	rankedMatches := extractMatchesByPlaylist(resolver, "ranked")
	start := seasonStartedAtFn(seasonSlug, seasonsMeta, resolver)
	var seasonMatches []any
	if start == "" {
		seasonMatches = rankedMatches
	} else {
		seasonMatches = make([]any, 0, len(rankedMatches))
		for _, m := range rankedMatches {
			obj := AsObject(m)
			if obj == nil {
				continue
			}
			if sa, ok := obj["started_at"].(string); ok && sa >= start {
				seasonMatches = append(seasonMatches, m)
			}
		}
	}
	rounds := summarizeMatchRounds(resolver, seasonMatches)
	mr := modeRecord

	return RankedStats{
		Season:                seasonSlug,
		SeasonSlug:            seasonSlug,
		SeasonDisplay:         seasonDisplayFn(seasonSlug, seasonsMeta, resolver),
		SeasonStartedAt:       start,
		Matches:               numInt32(resolver.Field(mr, "matches")),
		Wins:                  numInt32(resolver.Field(mr, "wins")),
		Losses:                numInt32(resolver.Field(mr, "losses")),
		Abandons:              numInt32(resolver.Field(mr, "abandons")),
		Kills:                 numInt32(resolver.Field(mr, "kills")),
		Deaths:                numInt32(resolver.Field(mr, "deaths")),
		Assists:               numInt32(resolver.Field(mr, "assists")),
		Headshots:             numInt32(resolver.Field(mr, "headshots")),
		KDRatio:               RoundTo(num(resolver.Field(mr, "kd")), 4),
		HeadshotPct:           RoundTo(num(resolver.Field(mr, "hs")), 2),
		WinRate:               RoundTo(num(resolver.Field(mr, "wr")), 2),
		RankPoints:            numInt32(resolver.Field(currentSeason, "rank_points")),
		PeakRankPoints:        numInt32(resolver.Field(currentSeason, "max_rank_points")),
		CurrentRankSlug:       currentRankSlug,
		CurrentRank:           currentRank,
		CurrentRankTier:       currentRankTier,
		PeakRankSlug:          peakRankSlug,
		PeakRank:              peakRank,
		PeakRankTier:          peakRankTier,
		AllTimePeakRankSlug:   allTimePeakSlug,
		AllTimePeakRank:       allTimePeakRank,
		AllTimePeakRankTier:   allTimePeakRankTier,
		AllTimePeakRankPoints: max(allTimePeakPoints, 0),
		AllTimePeakRankSeason: allTimePeakSeason,
		RoundsPlayed:          rounds.roundsPlayed,
		KillRounds:            rounds.killRounds,
		SurvivalRounds:        rounds.survivalRounds,
		TradedRounds:          rounds.tradedRounds,
		OpeningKillRounds:     rounds.openingKillRounds,
		MatchesInCache:        int32(len(seasonMatches)),
	}
}

type modeRecordSelection struct {
	seasonSlug string
	modeSlug   string
	record     any
}

func findModeRecord(
	seasonModeRecords, seasonsMeta any,
	resolver *NuxtResolver,
	matcher func(string) bool,
) *modeRecordSelection {
	smr := AsObject(resolver.Resolve(seasonModeRecords))
	if smr == nil {
		return nil
	}
	slugs := make([]string, 0, len(smr))
	for k := range smr {
		slugs = append(slugs, k)
	}
	sortSeasonSlugsByStartDesc(slugs, seasonsMeta, resolver)
	var bestZero *modeRecordSelection
	for _, seasonSlug := range slugs {
		seasonModesRaw, ok := smr[seasonSlug]
		if !ok {
			continue
		}
		seasonModes := resolver.Resolve(seasonModesRaw)
		seasonModesObj := AsObject(seasonModes)
		if seasonModesObj == nil {
			continue
		}
		for modeSlugRaw, recordRaw := range seasonModesObj {
			if !matcher(modeSlugRaw) {
				continue
			}
			record := resolver.Resolve(recordRaw)
			if !IsObject(record) {
				continue
			}
			candidate := &modeRecordSelection{
				seasonSlug: seasonSlug,
				modeSlug:   modeSlugRaw,
				record:     record,
			}
			if numInt32(resolver.Field(record, "matches")) > 0 {
				return candidate
			}
			if bestZero == nil {
				bestZero = candidate
			}
		}
	}
	return bestZero
}

func buildFallbackRankedModeStats(
	resolver *NuxtResolver,
	seasonModeRecords, seasonsMeta any,
) *RankedStats {
	quick := findModeRecord(seasonModeRecords, seasonsMeta, resolver, func(m string) bool {
		return strings.Contains(m, "quick-match") || strings.Contains(m, "quickmatch")
	})
	selection := quick
	if selection == nil {
		selection = findModeRecord(seasonModeRecords, seasonsMeta, resolver, func(string) bool { return true })
	}
	if selection == nil {
		return nil
	}

	quickMatches := extractMatchesByPlaylist(resolver, "quickmatch")
	pastMatches := quickMatches
	if len(pastMatches) == 0 {
		pastMatches = extractMatchesByPlaylist(resolver, "")
	}
	start := seasonStartedAtFn(selection.seasonSlug, seasonsMeta, resolver)
	var seasonMatches []any
	if start == "" {
		seasonMatches = pastMatches
	} else {
		seasonMatches = make([]any, 0, len(pastMatches))
		for _, m := range pastMatches {
			obj := AsObject(m)
			if obj == nil {
				continue
			}
			if sa, ok := obj["started_at"].(string); ok && sa >= start {
				seasonMatches = append(seasonMatches, m)
			}
		}
	}
	rounds := summarizeMatchRounds(resolver, seasonMatches)
	rec := selection.record
	matches := numInt32(resolver.Field(rec, "matches"))
	if int32(len(seasonMatches)) > matches {
		matches = int32(len(seasonMatches))
	}
	wins := numInt32(resolver.Field(rec, "wins"))
	losses := numInt32(resolver.Field(rec, "losses"))
	kills := numInt32(resolver.Field(rec, "kills"))
	deaths := numInt32(resolver.Field(rec, "deaths"))
	assists := numInt32(resolver.Field(rec, "assists"))
	headshots := numInt32(resolver.Field(rec, "headshots"))

	var kd float64
	if deaths > 0 {
		kd = float64(kills) / float64(deaths)
	} else {
		kd = float64(kills)
	}
	var hs float64
	if kills > 0 {
		hs = float64(headshots) / float64(kills) * 100
	}
	var wr float64
	if matches > 0 {
		wr = float64(wins) / float64(matches) * 100
	}
	recObj := AsObject(rec)
	hasKey := func(k string) bool { return recObj != nil && recObj[k] != nil }

	kdVal := kd
	if hasKey("kd") {
		kdVal = num(resolver.Field(rec, "kd"))
	}
	hsVal := hs
	if hasKey("hs") {
		hsVal = num(resolver.Field(rec, "hs"))
	}
	wrVal := wr
	if hasKey("wr") {
		wrVal = num(resolver.Field(rec, "wr"))
	}

	return &RankedStats{
		Season:              selection.seasonSlug,
		SeasonSlug:          selection.seasonSlug,
		SeasonDisplay:       seasonDisplayFn(selection.seasonSlug, seasonsMeta, resolver),
		SeasonStartedAt:     start,
		Mode:                selection.modeSlug,
		Matches:             matches,
		Wins:                wins,
		Losses:              losses,
		Abandons:            numInt32(resolver.Field(rec, "abandons")),
		Kills:               kills,
		Deaths:              deaths,
		Assists:             assists,
		Headshots:           headshots,
		KDRatio:             RoundTo(kdVal, 4),
		HeadshotPct:         RoundTo(hsVal, 2),
		WinRate:             RoundTo(wrVal, 2),
		CurrentRank:         "Unranked",
		CurrentRankTier:     "Unranked",
		PeakRank:            "Unranked",
		PeakRankTier:        "Unranked",
		AllTimePeakRank:     "Unranked",
		AllTimePeakRankTier: "Unranked",
		RoundsPlayed:        rounds.roundsPlayed,
		KillRounds:          rounds.killRounds,
		SurvivalRounds:      rounds.survivalRounds,
		TradedRounds:        rounds.tradedRounds,
		OpeningKillRounds:   rounds.openingKillRounds,
		MatchesInCache:      int32(len(seasonMatches)),
	}
}

func buildFallbackPastMatches(resolver *NuxtResolver) *RankedStats {
	past := extractMatchesByPlaylist(resolver, "")
	if len(past) == 0 {
		return nil
	}
	var kills, deaths, assists, headshots, wins, losses, abandons int32
	for _, m := range past {
		s := resolver.Field(m, "player_summary")
		if s == nil {
			continue
		}
		kills += numInt32(resolver.Field(s, "kills"))
		deaths += numInt32(resolver.Field(s, "deaths"))
		assists += numInt32(resolver.Field(s, "assists"))
		headshots += numInt32(resolver.Field(s, "headshots"))
		abandons += numInt32(resolver.Field(s, "abandons"))
		if obj := AsObject(s); obj != nil {
			won := obj["won"]
			if won == nil {
				won = obj["win"]
			}
			if won != nil {
				v := resolver.Resolve(won)
				if b, ok := v.(bool); ok {
					if b {
						wins++
					} else {
						losses++
					}
				} else if i, ok := v.(float64); ok {
					switch i {
					case 1:
						wins++
					case 0:
						losses++
					}
				} else if sv, ok := v.(string); ok {
					switch strings.ToLower(sv) {
					case "win":
						wins++
					case "loss":
						losses++
					}
				}
			}
		}
	}
	rounds := summarizeMatchRounds(resolver, past)
	matches := int32(len(past))
	var kd float64
	if deaths > 0 {
		kd = float64(kills) / float64(deaths)
	} else {
		kd = float64(kills)
	}
	var hsPct float64
	if kills > 0 {
		hsPct = float64(headshots) / float64(kills) * 100
	}
	var wr float64
	if matches > 0 {
		wr = float64(wins) / float64(matches) * 100
	}
	return &RankedStats{
		SeasonDisplay:       "Recent Matches",
		Mode:                "past-matches",
		Matches:             matches,
		Wins:                wins,
		Losses:              losses,
		Abandons:            abandons,
		Kills:               kills,
		Deaths:              deaths,
		Assists:             assists,
		Headshots:           headshots,
		KDRatio:             RoundTo(kd, 4),
		HeadshotPct:         RoundTo(hsPct, 2),
		WinRate:             RoundTo(wr, 2),
		CurrentRank:         "Unranked",
		CurrentRankTier:     "Unranked",
		PeakRank:            "Unranked",
		PeakRankTier:        "Unranked",
		AllTimePeakRank:     "Unranked",
		AllTimePeakRankTier: "Unranked",
		RoundsPlayed:        rounds.roundsPlayed,
		KillRounds:          rounds.killRounds,
		SurvivalRounds:      rounds.survivalRounds,
		TradedRounds:        rounds.tradedRounds,
		OpeningKillRounds:   rounds.openingKillRounds,
		MatchesInCache:      matches,
	}
}

// ScrapeHTMLStatsCollection parses HTML and extracts stats for all seasons.
func ScrapeHTMLStatsCollection(html string) ScrapedStatsCollection {
	payloadStr, ok := ExtractNuxtPayload(html)
	if !ok {
		return ScrapedStatsCollection{}
	}
	var payload []any
	if err := gojson.Unmarshal([]byte(payloadStr), &payload); err != nil {
		return ScrapedStatsCollection{}
	}
	return scrapePayload(payload)
}

func scrapePayload(payload []any) ScrapedStatsCollection {
	resolver := NewNuxtResolver(payload)
	pi, ci, ok := findProfileAndConstantsIndices(payload)
	if !ok {
		return ScrapedStatsCollection{}
	}
	profileVal := resolver.ResolveIndex(pi)
	if !IsObject(profileVal) {
		return ScrapedStatsCollection{}
	}
	constantsVal := resolver.ResolveIndex(ci)
	if !IsObject(constantsVal) {
		return ScrapedStatsCollection{}
	}
	rankedSeasons := resolver.Field(profileVal, "ranked_season_records")
	seasonModeRecords := resolver.Field(profileVal, "season_mode_records")
	seasonsMeta := resolver.Field(constantsVal, "seasons")
	ranks := resolver.Field(constantsVal, "ranks")
	rankTiers := resolver.Field(constantsVal, "rank_tiers")
	base := baseProfile(profileVal, resolver)
	catalog := buildSeasonCatalog(rankedSeasons, seasonsMeta, resolver)
	bySeason := make(map[string]ScrapedStats, len(catalog))
	for _, entry := range catalog {
		ranked := buildRankedForSeason(resolver, rankedSeasons, seasonModeRecords, seasonsMeta, ranks, rankTiers, entry.Slug)
		bySeason[entry.Slug] = toScraped(base, ranked)
	}
	var latest ScrapedStats
	if len(catalog) > 0 {
		if s, ok := bySeason[catalog[0].Slug]; ok {
			latest = s
		} else {
			latest = toScraped(base, RankedStats{})
		}
	} else {
		ranked := buildFallbackRankedModeStats(resolver, seasonModeRecords, seasonsMeta)
		if ranked == nil {
			r := buildFallbackPastMatches(resolver)
			if r != nil {
				ranked = r
			} else {
				ranked = &RankedStats{}
			}
		}
		latest = toScraped(base, *ranked)
	}
	return ScrapedStatsCollection{
		Latest:        latest,
		BySeason:      bySeason,
		SeasonCatalog: catalog,
	}
}

// ScrapeHTMLStats parses HTML and returns stats for a specific season (or latest).
func ScrapeHTMLStats(html string, seasonSelector string) ScrapedStats {
	collection := ScrapeHTMLStatsCollection(html)
	if seasonSelector != "" {
		if slug := CanonicalizeSeasonSelector(seasonSelector, collection.SeasonCatalog); slug != "" {
			if s, ok := collection.BySeason[slug]; ok {
				return s
			}
		}
	}
	return collection.Latest
}

// slugCanonNormalise normalizes a slug or display name for comparison.
func slugCanonNormalise(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	var b strings.Builder
	prevSep := false
	started := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		isSep := c == ' ' || c == '_' || c == '-' || c == '\t'
		if isSep {
			if !started {
				continue
			}
			if prevSep {
				continue
			}
			prevSep = true
			b.WriteByte('-')
			continue
		}
		prevSep = false
		started = true
		if c >= 'A' && c <= 'Z' {
			b.WriteByte(c + 32)
		} else {
			b.WriteByte(c)
		}
	}
	return b.String()
}

// CanonicalizeSeasonSelector matches a user-provided selector against the
// season catalog, trying slug match first, then display name match.
func CanonicalizeSeasonSelector(selector string, catalog []SeasonCatalogEntry) string {
	trimmed := strings.TrimSpace(selector)
	if trimmed == "" {
		return ""
	}
	normSelector := slugCanonNormalise(trimmed)
	for _, entry := range catalog {
		if slugCanonNormalise(entry.Slug) == normSelector {
			return entry.Slug
		}
	}
	for _, entry := range catalog {
		if slugCanonNormalise(entry.Display) == normSelector {
			return entry.Slug
		}
	}
	return ""
}
