//! HTML + Nuxt payload parsing. Pure (no network I/O).
//!
//! Originally a 1:1 port of the TS implementation that allocated an owned
//! `serde_json::Value` tree for every payload. The hot path has been reworked
//! around `simd_json::BorrowedValue`: we parse the `__NUXT_DATA__` bytes
//! once and then perform every lookup as a borrow + pointer chase. Owned
//! strings are allocated only at the very last step when we materialise the
//! public `ScrapedStats` / `RankedStats` structs.

use crate::metrics;
use crate::nuxt::NuxtResolver;
use serde::{Deserialize, Serialize};
use simd_json::prelude::*;
use simd_json::BorrowedValue;
use std::collections::BTreeMap;

/// A single player profile block.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct StatsProfile {
    pub username: String,
    pub level: i32,
    #[serde(default)]
    pub profile_id: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub profile_url: String,
}

/// Ranked or fallback-mode numeric stats. Matches `proto.stats.v1.RankedStats`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RankedStats {
    pub season: String,
    pub season_slug: String,
    pub season_display: String,
    pub season_started_at: String,
    pub mode: String,

    pub matches: i32,
    pub wins: i32,
    pub losses: i32,
    pub abandons: i32,

    pub kills: i32,
    pub deaths: i32,
    pub assists: i32,
    pub headshots: i32,

    pub kd_ratio: f64,
    pub headshot_percentage: f64,
    pub win_rate: f64,

    pub rank_points: i32,
    pub peak_rank_points: i32,

    pub current_rank_slug: String,
    pub current_rank: String,
    pub current_rank_tier: String,

    pub peak_rank_slug: String,
    pub peak_rank: String,
    pub peak_rank_tier: String,

    pub all_time_peak_rank_slug: String,
    pub all_time_peak_rank: String,
    pub all_time_peak_rank_tier: String,
    pub all_time_peak_rank_points: i32,
    pub all_time_peak_rank_season: String,

    pub rounds_played: i32,
    pub kill_rounds: i32,
    pub survival_rounds: i32,
    pub traded_rounds: i32,
    pub opening_kill_rounds: i32,
    pub matches_in_cache: i32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CalculatedMetrics {
    pub kost: f64,
    pub kost_lower_bound: f64,
    pub kost_upper_bound: f64,
    pub kost_description: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ScrapedStats {
    pub profile: StatsProfile,
    pub ranked_stats: RankedStats,
    pub calculated_metrics: CalculatedMetrics,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SeasonCatalogEntry {
    pub slug: String,
    pub display: String,
    pub started_at: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ScrapedStatsCollection {
    pub latest: ScrapedStats,
    pub by_season: BTreeMap<String, ScrapedStats>,
    pub season_catalog: Vec<SeasonCatalogEntry>,
}

const KOST_DESCRIPTION: &str =
    "Estimated KOST% from aggregated match summaries (no round-level K/O/S/T flags in payload)";

// ---------- HTML slicing ----------

/// Pull the `__NUXT_DATA__` JSON array out of an HTML document.
///
/// Zero allocations: we walk the source string with plain `str::find`, which
/// delegates to memchr/SIMD internally. stats.cc embeds the payload as
/// `<script id="__NUXT_DATA__" type="application/json">[...]</script>`.
pub fn extract_nuxt_payload(html: &str) -> Option<&str> {
    // We accept both `id="__NUXT_DATA__"` and `id='__NUXT_DATA__'` just in case
    // the upstream ever changes its quoting. The double-quoted form is what
    // stats.cc emits today.
    let id_pos = html
        .find("id=\"__NUXT_DATA__\"")
        .or_else(|| html.find("id='__NUXT_DATA__'"))?;

    // End of the opening <script ...> tag.
    let content_start = html[id_pos..].find('>')? + id_pos + 1;
    let content_end = html[content_start..].find("</script>")? + content_start;

    Some(html[content_start..content_end].trim())
}

// ---------- Small BorrowedValue accessors (zero alloc) ----------

#[inline]
fn num(v: Option<&BorrowedValue>) -> f64 {
    let Some(v) = v else { return 0.0 };
    if let Some(i) = v.as_i64() {
        return i as f64;
    }
    if let Some(u) = v.as_u64() {
        return u as f64;
    }
    if let Some(f) = v.as_f64() {
        return f;
    }
    if let Some(b) = v.as_bool() {
        return if b { 1.0 } else { 0.0 };
    }
    if let Some(s) = v.as_str() {
        return s.parse().unwrap_or(0.0);
    }
    0.0
}

#[inline]
fn num_i32(v: Option<&BorrowedValue>) -> i32 {
    num(v) as i32
}

/// Borrow the field's string value, if any. No allocation.
#[inline]
fn str_field<'a>(v: Option<&'a BorrowedValue<'a>>) -> Option<&'a str> {
    v?.as_str()
}

/// Same as `str_field` but additionally filters out empty strings — matches
/// the TS `optionalString` semantics.
#[inline]
fn nonempty_str<'a>(v: Option<&'a BorrowedValue<'a>>) -> Option<&'a str> {
    v?.as_str().filter(|s| !s.is_empty())
}

// ---------- payload shape detection ----------

/// Locate the profile and constants objects inside the payload. The payload
/// is a flat array; we identify the two blocks we care about by the presence
/// of signature keys, mirroring the TS implementation.
fn find_profile_and_constants_indices(payload: &[BorrowedValue]) -> (Option<usize>, Option<usize>) {
    let mut profile: Option<usize> = None;
    let mut constants: Option<usize> = None;

    for (i, item) in payload.iter().enumerate() {
        let Some(obj) = item.as_object() else {
            continue;
        };

        if profile.is_none()
            && obj.contains_key("username")
            && obj.contains_key("ranked_season_records")
            && obj.contains_key("season_mode_records")
        {
            profile = Some(i);
        }

        if constants.is_none()
            && obj.contains_key("rank_tiers")
            && obj.contains_key("ranks")
            && obj.contains_key("seasons")
        {
            constants = Some(i);
        }

        if profile.is_some() && constants.is_some() {
            break;
        }
    }

    (profile, constants)
}

// ---------- season catalog ----------

fn season_display<'a>(
    slug: &'a str,
    seasons_meta: &'a BorrowedValue<'a>,
    resolver: &NuxtResolver<'a>,
) -> &'a str {
    let meta = resolver.field(seasons_meta, slug);
    nonempty_str(meta.and_then(|m| resolver.field(m, "display"))).unwrap_or(slug)
}

fn season_started_at<'a>(
    slug: &str,
    seasons_meta: &'a BorrowedValue<'a>,
    resolver: &NuxtResolver<'a>,
) -> &'a str {
    let meta = resolver.field(seasons_meta, slug);
    str_field(meta.and_then(|m| resolver.field(m, "started_at"))).unwrap_or("")
}

/// Sort season slugs newest-first by their `started_at` timestamp. Ties break
/// by slug descending (lexical).
fn sort_season_slugs_by_start_desc<'a>(
    slugs: &mut [&'a str],
    seasons_meta: &'a BorrowedValue<'a>,
    resolver: &NuxtResolver<'a>,
) {
    slugs.sort_by(|l, r| {
        let ls = season_started_at(l, seasons_meta, resolver);
        let rs = season_started_at(r, seasons_meta, resolver);
        if ls == rs {
            r.cmp(l)
        } else {
            rs.cmp(ls)
        }
    });
}

fn build_season_catalog<'a>(
    ranked_seasons: &'a BorrowedValue<'a>,
    seasons_meta: &'a BorrowedValue<'a>,
    resolver: &NuxtResolver<'a>,
) -> Vec<SeasonCatalogEntry> {
    let Some(obj) = resolver.resolve(ranked_seasons).as_object() else {
        return Vec::new();
    };
    let mut slugs: Vec<&str> = obj.keys().map(|k| k.as_ref()).collect();
    sort_season_slugs_by_start_desc(&mut slugs, seasons_meta, resolver);

    slugs
        .into_iter()
        .map(|slug| SeasonCatalogEntry {
            slug: slug.to_string(),
            display: season_display(slug, seasons_meta, resolver).to_string(),
            started_at: season_started_at(slug, seasons_meta, resolver).to_string(),
        })
        .collect()
}

// ---------- rank label resolution ----------

fn rank_label<'a>(
    rank_slug: Option<&str>,
    ranks: &'a BorrowedValue<'a>,
    rank_tiers: &'a BorrowedValue<'a>,
    resolver: &NuxtResolver<'a>,
) -> (String, String) {
    let Some(slug) = rank_slug else {
        return ("Unknown".into(), "Unknown".into());
    };

    let rank_entry = resolver.field(ranks, slug);
    let display = nonempty_str(rank_entry.and_then(|r| resolver.field(r, "display")))
        .unwrap_or(slug)
        .to_string();

    let tier_slug = nonempty_str(rank_entry.and_then(|r| resolver.field(r, "tier")));
    let tier = match tier_slug {
        Some(t) => nonempty_str(
            resolver
                .field(rank_tiers, t)
                .and_then(|tm| resolver.field(tm, "display")),
        )
        .unwrap_or(t)
        .to_string(),
        None => "Unknown".to_string(),
    };
    (display, tier)
}

// ---------- match extraction ----------

/// Check whether `key` contains `"playlist":"<pl>"` without allocating a
/// fresh format string each call.
fn key_matches_playlist(key: &str, pl: &str) -> bool {
    const PREFIX: &str = "\"playlist\":\"";
    let Some(pos) = key.find(PREFIX) else {
        return false;
    };
    let rest = &key[pos + PREFIX.len()..];
    rest.as_bytes().len() > pl.len()
        && rest.as_bytes()[..pl.len()] == *pl.as_bytes()
        && rest.as_bytes()[pl.len()] == b'"'
}

/// Walk the payload looking for a `__query`-style entry whose key mentions
/// `"matches"` and (optionally) the requested playlist. Returns a borrowed
/// slice of match objects — no cloning.
fn extract_matches_by_playlist<'a>(
    resolver: &NuxtResolver<'a>,
    playlist: Option<&str>,
) -> Vec<&'a BorrowedValue<'a>> {
    for item in resolver.payload() {
        let Some(obj) = item.as_object() else {
            continue;
        };

        for (key, value) in obj.iter() {
            let k: &str = key.as_ref();
            if !k.contains("\"matches\"") {
                continue;
            }
            if let Some(pl) = playlist {
                if !key_matches_playlist(k, pl) {
                    continue;
                }
            }

            let resolved_query = resolver.resolve(value);
            let Some(arr) = resolved_query.as_array() else {
                continue;
            };
            let Some(first) = arr.first() else { continue };
            let first = resolver.resolve(first);
            let Some(query_map) = first.as_object() else {
                continue;
            };
            let Some(pages_raw) = query_map.get("pages") else {
                continue;
            };
            let pages = resolver.resolve(pages_raw);
            let Some(pages_arr) = pages.as_array() else {
                continue;
            };
            let Some(first_page_raw) = pages_arr.first() else {
                continue;
            };
            let first_page = resolver.resolve(first_page_raw);
            let Some(first_page_arr) = first_page.as_array() else {
                continue;
            };
            if first_page_arr.is_empty() {
                continue;
            }

            let mut out: Vec<&'a BorrowedValue<'a>> = Vec::with_capacity(first_page_arr.len());
            for m_raw in first_page_arr.iter() {
                let m = resolver.resolve(m_raw);
                if m.is_object() {
                    out.push(m);
                }
            }
            return out;
        }
    }
    Vec::new()
}

#[derive(Default)]
struct MatchRoundTotals {
    rounds_played: i32,
    survival_rounds: i32,
    traded_rounds: i32,
    opening_kill_rounds: i32,
    kill_rounds: i32,
}

fn summarize_match_rounds<'a>(
    resolver: &NuxtResolver<'a>,
    matches: &[&'a BorrowedValue<'a>],
) -> MatchRoundTotals {
    let mut t = MatchRoundTotals::default();
    for m in matches {
        let Some(s) = resolver.field(m, "player_summary") else {
            continue;
        };

        let rounds = num_i32(resolver.field(s, "rounds"));
        t.rounds_played += rounds;
        t.survival_rounds += num_i32(resolver.field(s, "round_survivals"));
        t.traded_rounds += num_i32(resolver.field(s, "trades"));
        t.opening_kill_rounds += num_i32(resolver.field(s, "opening_kills"));

        let kills = num_i32(resolver.field(s, "kills"));
        let kills_2k = num_i32(resolver.field(s, "kills_2k"));
        let kills_3k = num_i32(resolver.field(s, "kills_3k"));
        let kills_4k = num_i32(resolver.field(s, "kills_4k"));
        let kills_5k = num_i32(resolver.field(s, "kills_5k"));

        let mut rounds_with_kill = kills - kills_2k - 2 * kills_3k - 3 * kills_4k - 4 * kills_5k;
        rounds_with_kill = rounds_with_kill.max(0).min(rounds);
        t.kill_rounds += rounds_with_kill;
    }
    t
}

// ---------- profile materialisation ----------

fn base_profile<'a>(profile: &'a BorrowedValue<'a>, resolver: &NuxtResolver<'a>) -> StatsProfile {
    let username = nonempty_str(resolver.field(profile, "username"))
        .unwrap_or("Unknown")
        .to_string();
    StatsProfile {
        username,
        level: num_i32(resolver.field(profile, "level")),
        ..Default::default()
    }
}

fn to_scraped(profile: &StatsProfile, ranked: RankedStats) -> ScrapedStats {
    ScrapedStats {
        profile: profile.clone(),
        calculated_metrics: CalculatedMetrics {
            kost: metrics::calculate_kost(&ranked),
            kost_lower_bound: metrics::kost_lower_bound(&ranked),
            kost_upper_bound: metrics::kost_upper_bound(&ranked),
            kost_description: KOST_DESCRIPTION.into(),
        },
        ranked_stats: ranked,
    }
}

// ---------- ranked stats per season ----------

fn build_ranked_for_season<'a>(
    resolver: &NuxtResolver<'a>,
    ranked_seasons: &'a BorrowedValue<'a>,
    season_mode_records: &'a BorrowedValue<'a>,
    seasons_meta: &'a BorrowedValue<'a>,
    ranks: &'a BorrowedValue<'a>,
    rank_tiers: &'a BorrowedValue<'a>,
    season_slug: &str,
) -> RankedStats {
    let current_season = resolver.field(ranked_seasons, season_slug);

    let current_rank_slug = nonempty_str(current_season.and_then(|s| resolver.field(s, "rank")));
    let peak_rank_slug = nonempty_str(current_season.and_then(|s| resolver.field(s, "max_rank")));
    let (current_rank, current_rank_tier) =
        rank_label(current_rank_slug, ranks, rank_tiers, resolver);
    let (peak_rank, peak_rank_tier) = rank_label(peak_rank_slug, ranks, rank_tiers, resolver);

    // All-time peak across all seasons.
    let mut all_time_peak_season: Option<&str> = None;
    let mut all_time_peak_record: Option<&BorrowedValue> = None;
    let mut all_time_peak_points: i32 = -1;
    if let Some(seasons_obj) = resolver.resolve(ranked_seasons).as_object() {
        for (slug, rec_raw) in seasons_obj.iter() {
            let rec = resolver.resolve(rec_raw);
            let pts = num_i32(resolver.field(rec, "max_rank_points"));
            if pts > all_time_peak_points {
                all_time_peak_points = pts;
                all_time_peak_season = Some(slug.as_ref());
                all_time_peak_record = Some(rec);
            }
        }
    }
    let all_time_peak_slug =
        all_time_peak_record.and_then(|r| nonempty_str(resolver.field(r, "max_rank")));
    let (all_time_peak_rank, all_time_peak_rank_tier) =
        rank_label(all_time_peak_slug, ranks, rank_tiers, resolver);

    // Mode record: prefer `ranked-bomb`, else the first mode whose key contains "ranked".
    let season_modes_opt = resolver.field(season_mode_records, season_slug);
    let mode_record: Option<&BorrowedValue> = season_modes_opt.and_then(|sm| {
        if let Some(r) = resolver.field(sm, "ranked-bomb") {
            if r.is_object() {
                return Some(r);
            }
        }
        if let Some(sm_obj) = sm.as_object() {
            for (ms, rec_raw) in sm_obj.iter() {
                if ms.as_ref().contains("ranked") {
                    let r = resolver.resolve(rec_raw);
                    if r.is_object() {
                        return Some(r);
                    }
                }
            }
        }
        None
    });

    // Ranked matches filtered by season start.
    let ranked_matches = extract_matches_by_playlist(resolver, Some("ranked"));
    let start = season_started_at(season_slug, seasons_meta, resolver);
    let season_matches: Vec<&'a BorrowedValue<'a>> = if start.is_empty() {
        ranked_matches
    } else {
        ranked_matches
            .into_iter()
            .filter(|m| {
                m.as_object()
                    .and_then(|o| o.get("started_at"))
                    .and_then(|v| v.as_str())
                    .map_or(false, |s| s >= start)
            })
            .collect()
    };
    let rounds = summarize_match_rounds(resolver, &season_matches);

    let mr = mode_record; // shorten

    RankedStats {
        season: season_slug.to_string(),
        season_slug: season_slug.to_string(),
        season_display: season_display(season_slug, seasons_meta, resolver).to_string(),
        season_started_at: start.to_string(),
        mode: String::new(),

        matches: num_i32(mr.and_then(|r| resolver.field(r, "matches"))),
        wins: num_i32(mr.and_then(|r| resolver.field(r, "wins"))),
        losses: num_i32(mr.and_then(|r| resolver.field(r, "losses"))),
        abandons: num_i32(mr.and_then(|r| resolver.field(r, "abandons"))),
        kills: num_i32(mr.and_then(|r| resolver.field(r, "kills"))),
        deaths: num_i32(mr.and_then(|r| resolver.field(r, "deaths"))),
        assists: num_i32(mr.and_then(|r| resolver.field(r, "assists"))),
        headshots: num_i32(mr.and_then(|r| resolver.field(r, "headshots"))),

        kd_ratio: metrics::round_to(num(mr.and_then(|r| resolver.field(r, "kd"))), 4),
        headshot_percentage: metrics::round_to(num(mr.and_then(|r| resolver.field(r, "hs"))), 2),
        win_rate: metrics::round_to(num(mr.and_then(|r| resolver.field(r, "wr"))), 2),

        rank_points: num_i32(current_season.and_then(|s| resolver.field(s, "rank_points"))),
        peak_rank_points: num_i32(
            current_season.and_then(|s| resolver.field(s, "max_rank_points")),
        ),

        current_rank_slug: current_rank_slug.unwrap_or("").to_string(),
        current_rank,
        current_rank_tier,
        peak_rank_slug: peak_rank_slug.unwrap_or("").to_string(),
        peak_rank,
        peak_rank_tier,

        all_time_peak_rank_slug: all_time_peak_slug.unwrap_or("").to_string(),
        all_time_peak_rank,
        all_time_peak_rank_tier,
        all_time_peak_rank_points: all_time_peak_points.max(0),
        all_time_peak_rank_season: all_time_peak_season.unwrap_or("").to_string(),

        rounds_played: rounds.rounds_played,
        kill_rounds: rounds.kill_rounds,
        survival_rounds: rounds.survival_rounds,
        traded_rounds: rounds.traded_rounds,
        opening_kill_rounds: rounds.opening_kill_rounds,
        matches_in_cache: season_matches.len() as i32,
    }
}

// ---------- fallback ranked-mode stats (no ranked season) ----------

struct ModeRecordSelection<'a> {
    season_slug: &'a str,
    mode_slug: &'a str,
    record: &'a BorrowedValue<'a>,
}

fn find_mode_record<'a>(
    season_mode_records: &'a BorrowedValue<'a>,
    seasons_meta: &'a BorrowedValue<'a>,
    resolver: &NuxtResolver<'a>,
    mut matcher: impl FnMut(&str) -> bool,
) -> Option<ModeRecordSelection<'a>> {
    let smr = resolver.resolve(season_mode_records).as_object()?;
    let mut slugs: Vec<&str> = smr.keys().map(|k| k.as_ref()).collect();
    sort_season_slugs_by_start_desc(&mut slugs, seasons_meta, resolver);

    let mut best_zero: Option<ModeRecordSelection<'a>> = None;
    for season_slug in slugs {
        let Some(season_modes_raw) = smr.get(season_slug) else {
            continue;
        };
        let season_modes = resolver.resolve(season_modes_raw);
        let Some(season_modes_obj) = season_modes.as_object() else {
            continue;
        };

        for (mode_slug, record_raw) in season_modes_obj.iter() {
            let mode_slug_ref: &str = mode_slug.as_ref();
            if !matcher(mode_slug_ref) {
                continue;
            }
            let record = resolver.resolve(record_raw);
            if !record.is_object() {
                continue;
            }

            let candidate = ModeRecordSelection {
                season_slug,
                mode_slug: mode_slug_ref,
                record,
            };
            if num_i32(resolver.field(record, "matches")) > 0 {
                return Some(candidate);
            }
            if best_zero.is_none() {
                best_zero = Some(candidate);
            }
        }
    }
    best_zero
}

fn build_fallback_ranked_mode_stats<'a>(
    resolver: &NuxtResolver<'a>,
    season_mode_records: &'a BorrowedValue<'a>,
    seasons_meta: &'a BorrowedValue<'a>,
) -> Option<RankedStats> {
    let quick = find_mode_record(season_mode_records, seasons_meta, resolver, |m| {
        m.contains("quick-match") || m.contains("quickmatch")
    });
    let selection = quick
        .or_else(|| find_mode_record(season_mode_records, seasons_meta, resolver, |_| true))?;

    let ModeRecordSelection {
        season_slug,
        mode_slug,
        record,
    } = selection;

    let quick_matches = extract_matches_by_playlist(resolver, Some("quickmatch"));
    let past_matches = if quick_matches.is_empty() {
        extract_matches_by_playlist(resolver, None)
    } else {
        quick_matches
    };

    let start = season_started_at(season_slug, seasons_meta, resolver);
    let season_matches: Vec<&'a BorrowedValue<'a>> = if start.is_empty() {
        past_matches
    } else {
        past_matches
            .into_iter()
            .filter(|m| {
                m.as_object()
                    .and_then(|o| o.get("started_at"))
                    .and_then(|v| v.as_str())
                    .map_or(false, |s| s >= start)
            })
            .collect()
    };

    let rounds = summarize_match_rounds(resolver, &season_matches);

    let matches = num_i32(resolver.field(record, "matches")).max(season_matches.len() as i32);
    let wins = num_i32(resolver.field(record, "wins"));
    let losses = num_i32(resolver.field(record, "losses"));
    let kills = num_i32(resolver.field(record, "kills"));
    let deaths = num_i32(resolver.field(record, "deaths"));
    let assists = num_i32(resolver.field(record, "assists"));
    let headshots = num_i32(resolver.field(record, "headshots"));

    let kd = if deaths > 0 {
        kills as f64 / deaths as f64
    } else {
        kills as f64
    };
    let hs = if kills > 0 {
        headshots as f64 / kills as f64 * 100.0
    } else {
        0.0
    };
    let wr = if matches > 0 {
        wins as f64 / matches as f64 * 100.0
    } else {
        0.0
    };

    let record_obj = record.as_object();
    let has_key = |k: &str| -> bool { record_obj.map_or(false, |o| o.contains_key(k)) };

    Some(RankedStats {
        season: season_slug.to_string(),
        season_slug: season_slug.to_string(),
        season_display: season_display(season_slug, seasons_meta, resolver).to_string(),
        season_started_at: start.to_string(),
        mode: mode_slug.to_string(),

        matches,
        wins,
        losses,
        abandons: num_i32(resolver.field(record, "abandons")),
        kills,
        deaths,
        assists,
        headshots,

        kd_ratio: metrics::round_to(
            if has_key("kd") {
                num(resolver.field(record, "kd"))
            } else {
                kd
            },
            4,
        ),
        headshot_percentage: metrics::round_to(
            if has_key("hs") {
                num(resolver.field(record, "hs"))
            } else {
                hs
            },
            2,
        ),
        win_rate: metrics::round_to(
            if has_key("wr") {
                num(resolver.field(record, "wr"))
            } else {
                wr
            },
            2,
        ),

        current_rank: "Unranked".into(),
        current_rank_tier: "Unranked".into(),
        peak_rank: "Unranked".into(),
        peak_rank_tier: "Unranked".into(),
        all_time_peak_rank: "Unranked".into(),
        all_time_peak_rank_tier: "Unranked".into(),

        rounds_played: rounds.rounds_played,
        kill_rounds: rounds.kill_rounds,
        survival_rounds: rounds.survival_rounds,
        traded_rounds: rounds.traded_rounds,
        opening_kill_rounds: rounds.opening_kill_rounds,
        matches_in_cache: season_matches.len() as i32,

        ..Default::default()
    })
}

fn build_fallback_past_matches<'a>(resolver: &NuxtResolver<'a>) -> Option<RankedStats> {
    let past = extract_matches_by_playlist(resolver, None);
    if past.is_empty() {
        return None;
    }

    let mut kills = 0i32;
    let mut deaths = 0i32;
    let mut assists = 0i32;
    let mut headshots = 0i32;
    let mut wins = 0i32;
    let mut losses = 0i32;
    let mut abandons = 0i32;

    for m in &past {
        let Some(s) = resolver.field(m, "player_summary") else {
            continue;
        };
        kills += num_i32(resolver.field(s, "kills"));
        deaths += num_i32(resolver.field(s, "deaths"));
        assists += num_i32(resolver.field(s, "assists"));
        headshots += num_i32(resolver.field(s, "headshots"));
        abandons += num_i32(resolver.field(s, "abandons"));

        if let Some(obj) = s.as_object() {
            let won = obj.get("won").or_else(|| obj.get("win"));
            if let Some(v) = won {
                let v = resolver.resolve(v);
                if let Some(b) = v.as_bool() {
                    if b {
                        wins += 1;
                    } else {
                        losses += 1;
                    }
                } else if let Some(i) = v.as_i64() {
                    if i == 1 {
                        wins += 1;
                    } else if i == 0 {
                        losses += 1;
                    }
                } else if let Some(sv) = v.as_str() {
                    if sv.eq_ignore_ascii_case("win") {
                        wins += 1;
                    } else if sv.eq_ignore_ascii_case("loss") {
                        losses += 1;
                    }
                }
            }
        }
    }

    let rounds = summarize_match_rounds(resolver, &past);
    let matches = past.len() as i32;
    let kd = if deaths > 0 {
        kills as f64 / deaths as f64
    } else {
        kills as f64
    };
    let hs = if kills > 0 {
        headshots as f64 / kills as f64 * 100.0
    } else {
        0.0
    };
    let wr = if matches > 0 {
        wins as f64 / matches as f64 * 100.0
    } else {
        0.0
    };

    Some(RankedStats {
        season_display: "Recent Matches".into(),
        mode: "past-matches".into(),
        matches,
        wins,
        losses,
        abandons,
        kills,
        deaths,
        assists,
        headshots,
        kd_ratio: metrics::round_to(kd, 4),
        headshot_percentage: metrics::round_to(hs, 2),
        win_rate: metrics::round_to(wr, 2),
        current_rank: "Unranked".into(),
        current_rank_tier: "Unranked".into(),
        peak_rank: "Unranked".into(),
        peak_rank_tier: "Unranked".into(),
        all_time_peak_rank: "Unranked".into(),
        all_time_peak_rank_tier: "Unranked".into(),
        rounds_played: rounds.rounds_played,
        kill_rounds: rounds.kill_rounds,
        survival_rounds: rounds.survival_rounds,
        traded_rounds: rounds.traded_rounds,
        opening_kill_rounds: rounds.opening_kill_rounds,
        matches_in_cache: matches,
        ..Default::default()
    })
}

// ---------- public entry points ----------

/// Parse an HTML page into a full seasons collection. Port of
/// `scrapeHtmlStatsCollection` in the TS source.
pub fn scrape_html_stats_collection(html: &str) -> ScrapedStatsCollection {
    let Some(payload_str) = extract_nuxt_payload(html) else {
        tracing::warn!("stats.scrape.missing_payload: __NUXT_DATA__ not found");
        return ScrapedStatsCollection::default();
    };

    // simd-json parses in-place and needs a mutable byte buffer. This is the
    // only real allocation in the whole scrape path.
    let mut bytes: Vec<u8> = payload_str.as_bytes().to_vec();
    let parsed: BorrowedValue = match simd_json::to_borrowed_value(&mut bytes) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(error = %e, "stats.scrape.parse_error: failed to parse __NUXT_DATA__");
            return ScrapedStatsCollection::default();
        }
    };

    let Some(payload_vec) = parsed.as_array() else {
        tracing::warn!("stats.scrape.invalid_payload: expected top-level array");
        return ScrapedStatsCollection::default();
    };
    let payload: &[BorrowedValue] = payload_vec.as_slice();

    scrape_payload(payload)
}

fn scrape_payload(payload: &[BorrowedValue]) -> ScrapedStatsCollection {
    let resolver = NuxtResolver::new(payload);

    let (profile_idx, constants_idx) = find_profile_and_constants_indices(payload);
    let (Some(profile_idx), Some(constants_idx)) = (profile_idx, constants_idx) else {
        tracing::warn!("stats.scrape.invalid_payload: missing profile or constants");
        return ScrapedStatsCollection::default();
    };

    let profile = match resolver.resolve_index(profile_idx) {
        Some(v) if v.is_object() => v,
        _ => {
            tracing::warn!("stats.scrape.invalid_payload: profile index unresolved");
            return ScrapedStatsCollection::default();
        }
    };
    let constants = match resolver.resolve_index(constants_idx) {
        Some(v) if v.is_object() => v,
        _ => {
            tracing::warn!("stats.scrape.invalid_payload: constants index unresolved");
            return ScrapedStatsCollection::default();
        }
    };

    // Static fallback for missing constants fields. BorrowedValue::Static(Null)
    // is always-safe to return a reference to without allocating.
    static NULL: BorrowedValue<'static> = BorrowedValue::Static(simd_json::StaticNode::Null);

    let ranked_seasons = resolver
        .field(profile, "ranked_season_records")
        .unwrap_or(&NULL);
    let season_mode_records = resolver
        .field(profile, "season_mode_records")
        .unwrap_or(&NULL);
    let seasons_meta = resolver.field(constants, "seasons").unwrap_or(&NULL);
    let ranks = resolver.field(constants, "ranks").unwrap_or(&NULL);
    let rank_tiers = resolver.field(constants, "rank_tiers").unwrap_or(&NULL);

    let base = base_profile(profile, &resolver);
    let catalog = build_season_catalog(ranked_seasons, seasons_meta, &resolver);

    let mut by_season = BTreeMap::new();
    for entry in &catalog {
        let ranked = build_ranked_for_season(
            &resolver,
            ranked_seasons,
            season_mode_records,
            seasons_meta,
            ranks,
            rank_tiers,
            &entry.slug,
        );
        by_season.insert(entry.slug.clone(), to_scraped(&base, ranked));
    }

    let latest = if let Some(first) = catalog.first() {
        by_season
            .get(&first.slug)
            .cloned()
            .unwrap_or_else(|| to_scraped(&base, RankedStats::default()))
    } else {
        let ranked = build_fallback_ranked_mode_stats(&resolver, season_mode_records, seasons_meta)
            .or_else(|| build_fallback_past_matches(&resolver))
            .unwrap_or_default();
        to_scraped(&base, ranked)
    };

    ScrapedStatsCollection {
        latest,
        by_season,
        season_catalog: catalog,
    }
}

/// Scrape stats for a single season, or the latest if `season_selector` is None.
pub fn scrape_html_stats(html: &str, season_selector: Option<&str>) -> ScrapedStats {
    let collection = scrape_html_stats_collection(html);
    match season_selector.and_then(|s| canonicalize_season_selector(s, &collection.season_catalog))
    {
        Some(slug) => collection
            .by_season
            .get(&slug)
            .cloned()
            .unwrap_or(collection.latest),
        None => collection.latest,
    }
}

// ---------- season selector normalisation ----------

/// Iterator yielding the "canonical" bytes of a slug-like string: ASCII
/// lowercase, with runs of `[ _ -]` collapsed to a single `-`. Skips nothing
/// else — we only care about the common-case inputs (slugs + display names).
///
/// This lets us compare two strings byte-by-byte without allocating a
/// normalised copy of either.
struct SlugCanon<'a> {
    bytes: std::slice::Iter<'a, u8>,
    prev_was_sep: bool,
    started: bool,
}

impl<'a> SlugCanon<'a> {
    fn new(s: &'a str) -> Self {
        Self {
            bytes: s.as_bytes().iter(),
            prev_was_sep: false,
            started: false,
        }
    }
}

impl<'a> Iterator for SlugCanon<'a> {
    type Item = u8;
    fn next(&mut self) -> Option<u8> {
        for &b in self.bytes.by_ref() {
            let is_sep = b == b' ' || b == b'_' || b == b'-' || b == b'\t';
            if is_sep {
                if !self.started {
                    // leading separator -> skip (matches trim+collapse)
                    continue;
                }
                if self.prev_was_sep {
                    continue;
                }
                self.prev_was_sep = true;
                return Some(b'-');
            }
            self.prev_was_sep = false;
            self.started = true;
            return Some(b.to_ascii_lowercase());
        }
        None
    }
}

fn slug_canon_eq(a: &str, b: &str) -> bool {
    let mut la = SlugCanon::new(a).peekable();
    let mut lb = SlugCanon::new(b).peekable();
    loop {
        match (la.next(), lb.next()) {
            (Some(x), Some(y)) if x == y => continue,
            (None, None) => return true,
            // Trailing separator on one side is OK.
            (Some(b'-'), None) if la.peek().is_none() => return true,
            (None, Some(b'-')) if lb.peek().is_none() => return true,
            _ => return false,
        }
    }
}

/// Normalise display names the same way as slugs but collapsing to spaces.
/// We re-use `SlugCanon` and treat `-` as a separator, so "prep phase" and
/// "prep-phase" compare equal.
fn display_canon_eq(a: &str, b: &str) -> bool {
    // Reuse the slug canonical form — both "Prep Phase" and "prep-phase"
    // collapse to `prep-phase` under SlugCanon.
    slug_canon_eq(a, b)
}

/// Resolve a user-provided season selector ("prep-phase" or "Prep Phase") to a
/// canonical slug present in the catalog. Allocation-free in the common case.
pub fn canonicalize_season_selector(
    selector: &str,
    catalog: &[SeasonCatalogEntry],
) -> Option<String> {
    let trimmed = selector.trim();
    if trimmed.is_empty() {
        return None;
    }

    for entry in catalog {
        if slug_canon_eq(&entry.slug, trimmed) {
            return Some(entry.slug.clone());
        }
    }
    for entry in catalog {
        if display_canon_eq(&entry.display, trimmed) {
            return Some(entry.slug.clone());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn wrap_in_nuxt_html(payload: &Value) -> String {
        let body = payload.to_string();
        format!(
            "<html><head><script id=\"__NUXT_DATA__\" type=\"application/json\">{body}</script></head><body></body></html>"
        )
    }

    #[test]
    fn extracts_nuxt_payload() {
        let p = json!([1, "hello"]);
        let html = wrap_in_nuxt_html(&p);
        let out = extract_nuxt_payload(&html).unwrap();
        assert_eq!(out.len(), p.to_string().len());
    }

    #[test]
    fn empty_html_yields_default_collection() {
        let c = scrape_html_stats_collection("<html></html>");
        assert!(c.season_catalog.is_empty());
        assert!(c.by_season.is_empty());
    }

    #[test]
    fn season_selector_canonicalises_display_name() {
        let catalog = vec![SeasonCatalogEntry {
            slug: "prep-phase".into(),
            display: "Prep Phase".into(),
            started_at: "2026-01-01".into(),
        }];
        assert_eq!(
            canonicalize_season_selector("Prep Phase", &catalog).as_deref(),
            Some("prep-phase")
        );
        assert_eq!(
            canonicalize_season_selector("prep_phase", &catalog).as_deref(),
            Some("prep-phase")
        );
        assert_eq!(
            canonicalize_season_selector("  PREP-phase ", &catalog).as_deref(),
            Some("prep-phase")
        );
        assert_eq!(canonicalize_season_selector("unknown", &catalog), None);
    }

    fn minimal_payload() -> Value {
        json!([
            {
                "username": "TestUser",
                "level": 42,
                "ranked_season_records": {
                    "prep-phase": {
                        "rank": "diamond-2",
                        "max_rank": "diamond-1",
                        "rank_points": 4200,
                        "max_rank_points": 4500,
                    }
                },
                "season_mode_records": {
                    "prep-phase": {
                        "ranked-bomb": {
                            "matches": 50,
                            "wins": 30,
                            "losses": 20,
                            "kills": 250,
                            "deaths": 180,
                            "kd": 1.3889,
                            "wr": 60.0,
                        }
                    }
                }
            },
            {
                "rank_tiers": {
                    "diamond": { "display": "Diamond" }
                },
                "ranks": {
                    "diamond-2": { "display": "Diamond II", "tier": "diamond" },
                    "diamond-1": { "display": "Diamond I", "tier": "diamond" },
                },
                "seasons": {
                    "prep-phase": { "display": "Prep Phase", "started_at": "2026-01-01T00:00:00Z" }
                }
            }
        ])
    }

    #[test]
    fn ranked_season_path_produces_expected_stats() {
        let payload = minimal_payload();
        let html = wrap_in_nuxt_html(&payload);
        let c = scrape_html_stats_collection(&html);

        assert_eq!(c.season_catalog.len(), 1);
        assert_eq!(c.season_catalog[0].slug, "prep-phase");
        assert_eq!(c.season_catalog[0].display, "Prep Phase");
        assert_eq!(c.latest.profile.username, "TestUser");
        assert_eq!(c.latest.profile.level, 42);
        assert_eq!(c.latest.ranked_stats.matches, 50);
        assert_eq!(c.latest.ranked_stats.wins, 30);
        assert_eq!(c.latest.ranked_stats.current_rank, "Diamond II");
        assert_eq!(c.latest.ranked_stats.current_rank_tier, "Diamond");
    }

    #[test]
    fn empty_payload_fallback_path() {
        let payload = json!([
            {
                "username": "EmptyUser",
                "level": 0,
                "ranked_season_records": {},
                "season_mode_records": {
                    "something-season": {
                        "quick-match": {
                            "matches": 10, "wins": 5, "losses": 5, "kills": 20, "deaths": 20
                        }
                    }
                }
            },
            {
                "rank_tiers": {}, "ranks": {}, "seasons": {
                    "something-season": { "display": "Something", "started_at": "" }
                }
            }
        ]);
        let html = wrap_in_nuxt_html(&payload);
        let c = scrape_html_stats_collection(&html);
        assert!(c.season_catalog.is_empty());
        assert_eq!(c.latest.ranked_stats.mode, "quick-match");
        assert_eq!(c.latest.ranked_stats.matches, 10);
        assert_eq!(c.latest.ranked_stats.current_rank, "Unranked");
    }
}
