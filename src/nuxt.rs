//! Lazy zero-copy resolver over the `__NUXT_DATA__` payload.
//!
//! Nuxt serialises reactive state as a flat JSON array where nested values are
//! referenced by *index*: a number `42` inside the payload means "look at
//! payload\[42\]". Wrapper tuples like `["Reactive", 42]` mean the same thing.
//!
//! The original port of the TS implementation materialised a new owned
//! `serde_json::Value` tree for every index lookup, allocating thousands of
//! `String`s per scrape. This resolver instead holds references into the
//! already-parsed `simd_json::BorrowedValue` tree and follows pointers on
//! demand, returning `&'a BorrowedValue<'a>` — no cloning, no heap churn.
//!
//! Cycle safety is provided by a fixed hop budget: real payloads never chain
//! more than a couple of indirections per field, so a generous bound plus
//! a "stop when we'd revisit the same index" check is enough and avoids the
//! cost of maintaining a HashSet.

use simd_json::BorrowedValue;
use simd_json::prelude::*;

/// Tags that wrap an index reference inside the Nuxt payload.
/// e.g. `["Reactive", 42]` means "resolve index 42".
const NUXT_WRAPPER_TAGS: [&str; 6] = [
    "Reactive",
    "ShallowReactive",
    "Ref",
    "EmptyRef",
    "Set",
    "Map",
];

/// Safety cap on pointer-chase depth. Real payloads use at most 2-3 hops per
/// field; 64 leaves plenty of headroom while bounding worst-case cycles.
const MAX_HOPS: u32 = 64;

/// Zero-allocation resolver. Borrows the payload slice directly from the
/// parsed simd-json dom — no cloning, no memoisation table.
#[derive(Clone, Copy)]
pub struct NuxtResolver<'a> {
    payload: &'a [BorrowedValue<'a>],
}

impl<'a> NuxtResolver<'a> {
    /// Build a resolver over the top-level payload array.
    pub fn new(payload: &'a [BorrowedValue<'a>]) -> Self {
        Self { payload }
    }

    /// The backing payload slice.
    pub fn payload(&self) -> &'a [BorrowedValue<'a>] {
        self.payload
    }

    /// Follow pointers/wrappers until we land on a concrete value.
    ///
    /// Returns the input reference unchanged for anything that isn't an index
    /// pointer or a wrapper tuple. The returned reference lives as long as the
    /// underlying payload, so callers can freely propagate it.
    ///
    /// # Integer dereference semantics
    ///
    /// Nuxt 3's deduplication table stores each unique value exactly once.
    /// Object and array fields use **index references** that point directly
    /// to the final value's position in the flat array. After one
    /// dereference, the result is the actual value — it is **not** another
    /// index reference. Following small integers further would read
    /// unrelated entries from the dedup table, producing wrong results.
    ///
    /// The only exception is Nuxt wrapper tuples like `["Reactive", idx]`,
    /// whose inner element **is** a fresh reference that must be followed.
    #[inline]
    pub fn resolve(&self, mut val: &'a BorrowedValue<'a>) -> &'a BorrowedValue<'a> {
        let mut plain_int_consumed = false;
        for _ in 0..MAX_HOPS {
            // Scalar index reference: a plain integer in the payload means
            // "resolve payload[i]". Negative values stay unresolved so the
            // caller can distinguish -1 sentinels.
            if let Some(i) = val.as_i64() {
                if i < 0 {
                    return val;
                }
                let idx = i as usize;
                if idx >= self.payload.len() {
                    return val;
                }
                // After one integer dereference, a plain integer IS the
                // actual value — not another index reference. Modern Nuxt 3
                // payloads deduplicate by storing each unique value once;
                // chasing small integers further reads unrelated entries.
                if plain_int_consumed {
                    return val;
                }
                plain_int_consumed = true;
                val = &self.payload[idx];
                continue;
            }

            // Wrapper tuple: `["Reactive", 42]` and friends.
            // The inner element is a fresh index reference, so reset the
            // dereference guard to allow one more integer dereference.
            if let Some(arr) = val.as_array()
                && arr.len() == 2
                && let Some(tag) = arr[0].as_str()
                && NUXT_WRAPPER_TAGS.contains(&tag)
            {
                val = &arr[1];
                plain_int_consumed = false;
                continue;
            }

            return val;
        }
        val
    }

    /// Resolve the entry at `payload[i]`. Returns `None` if the index is out
    /// of bounds.
    #[inline]
    pub fn resolve_index(&self, i: usize) -> Option<&'a BorrowedValue<'a>> {
        self.payload.get(i).map(|v| self.resolve(v))
    }

    /// Object field access that auto-follows pointers on both the container
    /// (in case `value` is itself a pointer) and the returned field.
    #[inline]
    pub fn field(&self, value: &'a BorrowedValue<'a>, key: &str) -> Option<&'a BorrowedValue<'a>> {
        let resolved = self.resolve(value);
        let obj = resolved.as_object()?;
        let raw = obj.get(key)?;
        Some(self.resolve(raw))
    }
}

/// Nuxt emits `{"__i": ...}` as a null sentinel in some payloads.
#[inline]
pub fn is_null_sentinel(value: &BorrowedValue<'_>) -> bool {
    match value.as_object() {
        Some(obj) => obj.len() == 1 && obj.contains_key("__i"),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Parse a JSON top-level array and hand back the inner `Vec`.
    /// `bytes` must outlive the returned slice.
    fn payload_slice<'a>(bytes: &'a mut Vec<u8>) -> Vec<BorrowedValue<'a>> {
        let v: BorrowedValue<'a> = simd_json::to_borrowed_value(bytes.as_mut_slice()).unwrap();
        match v {
            BorrowedValue::Array(a) => *a,
            _ => panic!("expected top-level array"),
        }
    }

    #[test]
    fn resolves_scalar_indirection() {
        let mut bytes = br#"[1, "hello"]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        assert_eq!(r.resolve(&payload[0]).as_str(), Some("hello"));
    }

    #[test]
    fn treats_negative_one_as_unresolved() {
        let mut bytes = br#"[-1]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        // -1 stays as-is (negative); callers read it as the null sentinel.
        assert_eq!(r.resolve(&payload[0]).as_i64(), Some(-1));
    }

    #[test]
    fn unwraps_reactive_wrapper() {
        let mut bytes = br#"[1, "value", ["Reactive", 1]]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        assert_eq!(r.resolve(&payload[2]).as_str(), Some("value"));
    }

    #[test]
    fn field_follows_pointers() {
        let mut bytes = br#"[{"name": 1}, "deep value"]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        let v = r.field(&payload[0], "name").unwrap();
        assert_eq!(v.as_str(), Some("deep value"));
    }

    #[test]
    fn detects_null_sentinel() {
        let mut bytes = br#"[{"__i": 5}]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        assert!(is_null_sentinel(&payload[0]));
    }

    #[test]
    fn self_cycle_does_not_spin_forever() {
        // payload[0] = 1 -> payload[1] = 0 -> payload[0] = 1 ... infinite
        // without guards. With plain_int_consumed the second hop is blocked,
        // so this resolves as: payload[0] = 1 -> payload[1] = 0 -> return 0.
        let mut bytes = br#"[1, 0]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        let result = r.resolve(&payload[0]);
        assert_eq!(result.as_i64(), Some(0));
    }

    // --- Regression tests for stats.cc Nuxt 3 payload format ---

    // Stats.cc uses a dedup table where small integers (like match counts)
    // are stored at positions that also happen to hold other unrelated
    // values. After one index dereference, the result IS the actual value
    // and must NOT be followed as another reference.

    #[test]
    fn stops_after_one_integer_dereference() {
        // payload[0] points to payload[1] which holds the integer 42.
        // After resolving payload[0] -> payload[1] = 42, we must return 42
        // and NOT follow 42 as another index (which would go out of bounds
        // or read unrelated data).
        let mut bytes = br#"[1, 42]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        let result = r.resolve(&payload[0]);
        assert_eq!(result.as_i64(), Some(42));
    }

    #[test]
    fn does_not_chase_small_integer_to_unrelated_value() {
        // Real stats.cc scenario: an object field references position 2,
        // which holds the integer 3 (the actual value, e.g. 3 wins).
        // Position 3 holds a string "quick-match" — an unrelated constant.
        // The resolver must stop at the integer 3, not chase to "quick-match".
        let mut bytes = br#"[{"wins": 2}, "unrelated", 3, "quick-match"]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        let wins = r.field(&payload[0], "wins").unwrap();
        assert_eq!(wins.as_i64(), Some(3));
    }

    #[test]
    fn does_not_chase_integer_to_array() {
        // Real stats.cc scenario: matches count is 15, stored at a position
        // whose index (15) also exists in the array and holds an unrelated
        // array value.
        let mut bytes = br#"[{"matches": 1}, 15, ["battleye", "cheating"]]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        let matches = r.field(&payload[0], "matches").unwrap();
        assert_eq!(matches.as_i64(), Some(15));
    }

    #[test]
    fn does_not_chase_zero_to_first_element() {
        // Real stats.cc scenario: abandons=0 is stored via index reference
        // to position holding integer 0. The old resolver would follow
        // payload[0] which might be a wrapper tuple or unrelated object.
        let mut bytes = br#"[["ShallowReactive", 2], 0, {"abandons": 1}]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        let obj = r.resolve(&payload[2]);
        let abandons = r.field(obj, "abandons").unwrap();
        assert_eq!(abandons.as_i64(), Some(0));
    }

    #[test]
    fn follows_string_through_one_hop() {
        // String values work as before: one dereference yields the string.
        let mut bytes = br#"[{"rank": 1}, "bronze-ii"]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        let rank = r.field(&payload[0], "rank").unwrap();
        assert_eq!(rank.as_str(), Some("bronze-ii"));
    }

    #[test]
    fn wrapper_allows_fresh_dereference() {
        // A wrapper tuple like ["Reactive", 2] introduces a fresh reference.
        // After unwrapping, the inner index gets one new dereference.
        let mut bytes = br#"[["Reactive", 2], {"level": 3}, 200]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        // Resolve the wrapper: unwrap -> 2 -> payload[2] = 200 -> return 200
        let result = r.resolve(&payload[0]);
        assert_eq!(result.as_i64(), Some(200));
    }

    #[test]
    fn out_of_bounds_integer_is_returned_as_is() {
        // Large integers that are out of bounds must be returned as the
        // literal value, not followed. (stats.cc stores all_time_peak_rank
        // values like 2414 that exceed the payload array length.)
        let mut bytes = br#"[{"peak": 1}, 2414]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        let peak = r.field(&payload[0], "peak").unwrap();
        assert_eq!(peak.as_i64(), Some(2414));
    }

    #[test]
    fn real_stats_cc_payload_smoke_test() {
        // Minimal reproduction of a real stats.cc Nuxt payload.
        // Each position in the array is a deduplicated value. Object fields
        // hold index references. After one dereference, the integer IS the
        // actual value — it must NOT be followed to another position.
        //
        // Position layout:
        //  [0]  constants object
        //  [1]  profile object (with index-reference fields)
        //  [2]  "silent-hunt"    (string)
        //  [3]  "bronze-ii"      (string)
        //  [4]  "Avqny"         (string)
        //  [5]  200             (integer - player level)
        //  [6]  ranked_season_records object
        //  [7]  season_mode_records object
        //  [8]  ranked-bomb mode record object
        //  [9]  "Silent Hunt"   (string)
        //  [10] 15               (integer - matches count)
        //  [11] 9                (integer - wins)
        //  [12] 6                (integer - losses)
        //  [13] 94               (integer - kills)
        //  [14] 60               (integer - deaths, also used for wr%)
        //  [15] 1.5667           (float - kd)
        //  [16] 41.49            (float - hs%)
        //  [17] 0                (integer - abandons)
        //  [18] 56               (integer - assists)
        //  [19] 1883             (integer - rank_points, large enough to be valid)
        let mut bytes = br#"[
            {"rank_tiers": {}, "ranks": {}, "seasons": {}},
            {"username": 4, "level": 5, "ranked_season_records": 6, "season_mode_records": 7},
            "silent-hunt",
            "bronze-ii",
            "Avqny",
            200,
            {"silent-hunt": {"rank": 3, "max_rank": 3, "rank_points": 19, "max_rank_points": 19}},
            {"silent-hunt": 8},
            {"matches": 10, "wins": 11, "losses": 12, "kills": 13, "deaths": 14, "kd": 15, "hs": 16, "wr": 14, "abandons": 17, "headshots": 13, "assists": 18, "rank": 3, "max_rank": 3, "rank_points": 19, "max_rank_points": 19},
            "Silent Hunt",
            15,
            9,
            6,
            94,
            60,
            1.5667,
            41.49,
            0,
            56,
            1883
        ]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);

        let profile = r.resolve(&payload[1]);
        assert_eq!(r.field(profile, "username").unwrap().as_str(), Some("Avqny"));
        assert_eq!(r.field(profile, "level").unwrap().as_i64(), Some(200));

        let season_modes = r.field(profile, "season_mode_records").unwrap();
        let ranked_bomb = r.field(season_modes, "silent-hunt").unwrap();
        assert_eq!(r.field(ranked_bomb, "matches").unwrap().as_i64(), Some(15));
        assert_eq!(r.field(ranked_bomb, "wins").unwrap().as_i64(), Some(9));
        assert_eq!(r.field(ranked_bomb, "losses").unwrap().as_i64(), Some(6));
        assert_eq!(r.field(ranked_bomb, "kills").unwrap().as_i64(), Some(94));
        // deaths=14 -> payload[14] = 60. Must stop at 60, not follow 60 to
        // some unrelated value if position 60 existed in the array.
        assert_eq!(r.field(ranked_bomb, "deaths").unwrap().as_i64(), Some(60));
        assert_eq!(r.field(ranked_bomb, "wr").unwrap().as_i64(), Some(60));
        assert_eq!(r.field(ranked_bomb, "rank").unwrap().as_str(), Some("bronze-ii"));
        assert_eq!(r.field(ranked_bomb, "abandons").unwrap().as_i64(), Some(0));
        // rank_points=19 -> payload[19] = 1883. Must stop at 1883, not treat
        // it as another index reference.
        assert_eq!(r.field(ranked_bomb, "rank_points").unwrap().as_i64(), Some(1883));
    }
}