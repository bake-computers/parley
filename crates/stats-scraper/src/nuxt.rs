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

use simd_json::prelude::*;
use simd_json::BorrowedValue;

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
    #[inline]
    pub fn resolve(&self, mut val: &'a BorrowedValue<'a>) -> &'a BorrowedValue<'a> {
        let mut last_idx: isize = -1;
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
                // Cheap self-cycle guard: if following this pointer would
                // land us right back where we just were, bail out.
                if idx as isize == last_idx {
                    return val;
                }
                last_idx = idx as isize;
                val = &self.payload[idx];
                continue;
            }

            // Wrapper tuple: `["Reactive", 42]` and friends.
            if let Some(arr) = val.as_array() {
                if arr.len() == 2 {
                    if let Some(tag) = arr[0].as_str() {
                        if NUXT_WRAPPER_TAGS.iter().any(|w| *w == tag) {
                            val = &arr[1];
                            continue;
                        }
                    }
                }
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
        // without guards. Must bail out cleanly.
        let mut bytes = br#"[1, 0]"#.to_vec();
        let payload = payload_slice(&mut bytes);
        let r = NuxtResolver::new(&payload);
        let _ = r.resolve(&payload[0]);
    }
}
