//! Small TTL cache for scraped stats so repeated lookups for the same user
//! don't trigger a fresh upstream scrape.
//!
//! Design:
//!   * Keys are `(username_normalised, platform, season_or_empty)`.
//!   * Entries have an absolute expiry `Instant`.
//!   * Lookup is O(1) through a `parking_lot`-free `std::sync::Mutex` — stats
//!     lookups are an order of magnitude slower than lock contention so we
//!     don't bother with a sharded map.
//!   * Eviction happens lazily on lookup + opportunistically during insert
//!     when the map grows past a soft cap.

use crate::StatsPlatform;
use crate::scrape::ScrapedStats;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Clone, Debug)]
pub struct StatsCacheConfig {
    pub ttl: Duration,
    pub max_entries: usize,
}

impl Default for StatsCacheConfig {
    fn default() -> Self {
        Self {
            ttl: Duration::from_secs(60),
            max_entries: 1024,
        }
    }
}

#[derive(Debug)]
struct Entry<T> {
    expires_at: Instant,
    value: T,
}

#[derive(Debug)]
pub struct StatsCache {
    stats: Mutex<HashMap<String, Entry<ScrapedStats>>>,
    collections: Mutex<HashMap<String, Entry<crate::scrape::ScrapedStatsCollection>>>,
    cfg: StatsCacheConfig,
}

impl Default for StatsCache {
    fn default() -> Self {
        Self::new(StatsCacheConfig::default())
    }
}

impl StatsCache {
    pub fn new(cfg: StatsCacheConfig) -> Self {
        Self {
            stats: Mutex::new(HashMap::new()),
            collections: Mutex::new(HashMap::new()),
            cfg,
        }
    }

    pub fn get(
        &self,
        username: &str,
        platform: StatsPlatform,
        season: Option<&str>,
    ) -> Option<ScrapedStats> {
        let key = key_for(username, platform, season);
        let mut map = self.stats.lock().ok()?;
        let entry = map.get(&key)?;
        if entry.expires_at > Instant::now() {
            Some(entry.value.clone())
        } else {
            map.remove(&key);
            None
        }
    }

    pub fn put(
        &self,
        username: &str,
        platform: StatsPlatform,
        season: Option<&str>,
        value: ScrapedStats,
    ) {
        let key = key_for(username, platform, season);
        let expires_at = Instant::now() + self.cfg.ttl;
        let Ok(mut map) = self.stats.lock() else {
            return;
        };
        Self::evict_if_needed(&mut map, self.cfg.max_entries);
        map.insert(key, Entry { expires_at, value });
    }

    pub fn get_collection(
        &self,
        username: &str,
        platform: StatsPlatform,
    ) -> Option<crate::scrape::ScrapedStatsCollection> {
        let key = key_for(username, platform, None);
        let mut map = self.collections.lock().ok()?;
        let entry = map.get(&key)?;
        if entry.expires_at > Instant::now() {
            Some(entry.value.clone())
        } else {
            map.remove(&key);
            None
        }
    }

    pub fn put_collection(
        &self,
        username: &str,
        platform: StatsPlatform,
        value: crate::scrape::ScrapedStatsCollection,
    ) {
        let key = key_for(username, platform, None);
        let expires_at = Instant::now() + self.cfg.ttl;
        let Ok(mut map) = self.collections.lock() else {
            return;
        };
        Self::evict_if_needed(&mut map, self.cfg.max_entries);
        map.insert(key, Entry { expires_at, value });
    }

    fn evict_if_needed<T>(map: &mut HashMap<String, Entry<T>>, max: usize) {
        if map.len() < max {
            return;
        }
        let now = Instant::now();
        map.retain(|_, v| v.expires_at > now);
        if map.len() >= max
            && let Some(k) = map
                .iter()
                .min_by_key(|(_, v)| v.expires_at)
                .map(|(k, _)| k.clone())
        {
            map.remove(&k);
        }
    }

    /// Drop all entries. Useful for tests.
    pub fn clear(&self) {
        if let Ok(mut m) = self.stats.lock() {
            m.clear();
        }
        if let Ok(mut m) = self.collections.lock() {
            m.clear();
        }
    }
}

fn key_for(username: &str, platform: StatsPlatform, season: Option<&str>) -> String {
    let season = season.unwrap_or("");
    // `to_ascii_lowercase` is a no-alloc byte transform on the owned String;
    // usernames on stats.cc are always ASCII, so the Unicode-aware
    // `to_lowercase` pass is pure overhead.
    format!(
        "{}::{}::{}",
        username.trim().to_ascii_lowercase(),
        platform.as_str(),
        season
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scrape::ScrapedStats;

    #[test]
    fn returns_none_when_missing() {
        let c = StatsCache::default();
        assert!(c.get("alice", StatsPlatform::Pc, None).is_none());
    }

    #[test]
    fn stores_and_retrieves() {
        let c = StatsCache::default();
        let mut s = ScrapedStats::default();
        s.profile.username = "alice".into();
        c.put("alice", StatsPlatform::Pc, None, s.clone());
        let got = c.get("alice", StatsPlatform::Pc, None).unwrap();
        assert_eq!(got.profile.username, "alice");
    }

    #[test]
    fn expires_after_ttl() {
        let c = StatsCache::new(StatsCacheConfig {
            ttl: Duration::from_millis(1),
            max_entries: 8,
        });
        c.put("alice", StatsPlatform::Pc, None, ScrapedStats::default());
        std::thread::sleep(Duration::from_millis(10));
        assert!(c.get("alice", StatsPlatform::Pc, None).is_none());
    }

    #[test]
    fn platform_and_season_are_part_of_the_key() {
        let c = StatsCache::default();
        let mut s1 = ScrapedStats::default();
        s1.profile.username = "pc".into();
        let mut s2 = ScrapedStats::default();
        s2.profile.username = "xbox".into();
        c.put("alice", StatsPlatform::Pc, None, s1);
        c.put("alice", StatsPlatform::Xbox, None, s2);

        assert_eq!(
            c.get("alice", StatsPlatform::Pc, None)
                .unwrap()
                .profile
                .username,
            "pc"
        );
        assert_eq!(
            c.get("alice", StatsPlatform::Xbox, None)
                .unwrap()
                .profile
                .username,
            "xbox"
        );
    }
}
