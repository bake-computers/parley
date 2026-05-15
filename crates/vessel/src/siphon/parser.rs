//! UID extraction from scraped stats collections.
//!
//! Siphon is a graph crawler: given a seed UID, it discovers connected UIDs
//! (teammates, opponents) and recursively feeds them back into the queue. This
//! module extracts player UIDs from the output of the stats-scraper crate so
//! the Siphon worker can forward them to the crawl channel.

use stats_scraper::scrape::ScrapedStatsCollection;

/// Max UIDs per season entry in the extraction pass.
const MAX_PER_ENTRY: usize = 10;

/// Maximum total UIDs returned.
const MAX_TOTAL: usize = 100;

/// Extract player UIDs from a scraped stats collection.
///
/// Walks every [`ScrapedStats`] entry in `collection.by_season` and pulls
/// `profile_id` (a UUID) from the profile block. Returns a deduplicated,
/// ordered `Vec` of unique UID strings. The function observes two safety
/// caps: up to 10 UIDs per season entry and 100 total in the output.
pub fn extract_match_participants(collection: &ScrapedStatsCollection) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    let mut entries: Vec<&str> = Vec::new();

    let latest_id = collection.latest.profile.profile_id.as_str();
    if !latest_id.is_empty() {
        entries.push(latest_id);
    }

    for stats in collection.by_season.values() {
        let id = stats.profile.profile_id.as_str();
        if !id.is_empty() {
            entries.push(id);
        }
    }

    for id in entries {
        if out.len() >= MAX_TOTAL {
            break;
        }
        // Enforce per-entry cap (each entry produces at most 1 UID from
        // profile_id, so this is a no-op today but guards against future
        // multi-UID profile expansions).
        let entry_count_before = out.len();
        if seen.insert(id) {
            out.push(id.to_string());
        }
        // Sanity: if an entry somehow contributed more than MAX_PER_ENTRY,
        // truncate to the per-entry cap.
        let added = out.len() - entry_count_before;
        if added > MAX_PER_ENTRY {
            out.truncate(out.len() - (added - MAX_PER_ENTRY));
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use stats_scraper::scrape::{
        CalculatedMetrics, RankedStats, ScrapedStats, ScrapedStatsCollection, StatsProfile,
    };
    use std::collections::BTreeMap;

    fn make_profile(profile_id: &str) -> StatsProfile {
        StatsProfile {
            profile_id: profile_id.to_string(),
            username: "testuser".into(),
            ..Default::default()
        }
    }

    fn make_entry(profile_id: &str) -> ScrapedStats {
        ScrapedStats {
            profile: make_profile(profile_id),
            ranked_stats: RankedStats::default(),
            calculated_metrics: CalculatedMetrics::default(),
        }
    }

    #[test]
    fn test_extract_participants_from_fixture() {
        let mut by_season = BTreeMap::new();
        by_season.insert(
            "season-a".into(),
            make_entry("aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee"),
        );
        by_season.insert(
            "season-b".into(),
            make_entry("aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee"),
        );
        by_season.insert(
            "season-c".into(),
            make_entry("11111111-2222-4333-9444-555555555555"),
        );

        let collection = ScrapedStatsCollection {
            latest: make_entry("aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee"),
            by_season,
            ..Default::default()
        };

        let mut uids = extract_match_participants(&collection);
        uids.sort();
        assert_eq!(uids.len(), 2);
        assert_eq!(uids[0], "11111111-2222-4333-9444-555555555555");
        assert_eq!(uids[1], "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee");
    }

    #[test]
    fn test_empty_collection_returns_empty() {
        let collection = ScrapedStatsCollection::default();
        let uids = extract_match_participants(&collection);
        assert!(uids.is_empty());
    }

    #[test]
    fn test_empty_profile_id_skipped() {
        let mut by_season = BTreeMap::new();
        by_season.insert("empty-season".into(), make_entry(""));
        by_season.insert(
            "valid-season".into(),
            make_entry("11111111-2222-4333-9444-555555555555"),
        );

        let collection = ScrapedStatsCollection {
            latest: ScrapedStats::default(),
            by_season,
            ..Default::default()
        };

        let uids = extract_match_participants(&collection);
        assert_eq!(uids.len(), 1);
        assert_eq!(uids[0], "11111111-2222-4333-9444-555555555555");
    }

    #[test]
    fn test_many_entries_dedup_and_bounded() {
        let mut by_season = BTreeMap::new();
        for i in 0..120 {
            let uid = format!("{:032x}", i);
            by_season.insert(format!("season-{i}"), make_entry(&uid));
        }
        let collection = ScrapedStatsCollection {
            latest: make_entry("00000000000000000000000000000000"),
            by_season,
            ..Default::default()
        };

        let uids = extract_match_participants(&collection);
        assert!(uids.len() <= MAX_TOTAL);
        assert!(uids.len() >= 1);
        let unique: std::collections::HashSet<&str> = uids.iter().map(|s| s.as_str()).collect();
        assert_eq!(unique.len(), uids.len());
    }
}
