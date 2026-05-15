//! Hull: Thread-safe bloom filter wrapper for deduplication.

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use fastbloom::AtomicBloomFilter;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum HullError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] bincode::Error),
    #[error("Corrupted bloom filter data: {0}")]
    Corruption(String),
}

pub struct Hull {
    filter: AtomicBloomFilter,
    items_inserted: AtomicU64,
}

impl Hull {
    pub fn with_capacity(expected_items: usize, fp_rate: f64) -> Self {
        let filter = AtomicBloomFilter::with_false_pos(fp_rate).expected_items(expected_items);
        Self {
            filter,
            items_inserted: AtomicU64::new(0),
        }
    }

    pub fn check_or_insert(&self, uid: &str) -> bool {
        if self.filter.contains(uid) {
            return true;
        }
        self.filter.insert(uid);
        self.items_inserted.fetch_add(1, Ordering::Relaxed);
        false
    }

    pub fn contains(&self, uid: &str) -> bool {
        self.filter.contains(uid)
    }

    pub fn items_inserted(&self) -> u64 {
        self.items_inserted.load(Ordering::Relaxed)
    }

    pub fn clear(&mut self) {
        self.filter = AtomicBloomFilter::with_false_pos(0.01).expected_items(400_000);
        self.items_inserted.store(0, Ordering::Relaxed);
    }

    pub fn save(&self, path: &Path) -> Result<(), HullError> {
        let data = BloomFilterData {
            filter: self.filter.clone(),
            items_inserted: self.items_inserted.load(Ordering::Relaxed),
        };
        let encoded = bincode::serialize(&data)?;
        std::fs::write(path, encoded)?;
        Ok(())
    }

    pub fn load(path: &Path) -> Result<Self, HullError> {
        match Self::load_impl(path) {
            Ok(hull) => Ok(hull),
            Err(e) => {
                eprintln!(
                    "Warning: corrupted bloom filter at {:?}, creating fresh filter: {}",
                    path, e
                );
                Ok(Self::default())
            }
        }
    }

    fn load_impl(path: &Path) -> Result<Self, HullError> {
        let data = std::fs::read(path)?;
        let data: BloomFilterData =
            bincode::deserialize(&data).map_err(|e| HullError::Corruption(e.to_string()))?;
        Ok(Self {
            filter: data.filter,
            items_inserted: AtomicU64::new(data.items_inserted),
        })
    }
}

impl Default for Hull {
    fn default() -> Self {
        Self::with_capacity(400_000, 0.01)
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct BloomFilterData {
    filter: AtomicBloomFilter,
    items_inserted: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tempfile::tempdir;

    #[test]
    fn test_default_capacity() {
        let hull = Hull::default();
        assert_eq!(hull.items_inserted(), 0);
    }

    #[test]
    fn test_check_or_insert_returns_false_for_new_item() {
        let hull = Hull::with_capacity(1000, 0.01);
        let result = hull.check_or_insert("unique-id-123");
        assert!(!result, "New item should return false");
        assert_eq!(hull.items_inserted(), 1);
    }

    #[test]
    fn test_check_or_insert_returns_true_for_duplicate() {
        let hull = Hull::with_capacity(1000, 0.01);
        hull.check_or_insert("unique-id-123");
        let result = hull.check_or_insert("unique-id-123");
        assert!(result, "Duplicate item should return true");
        assert_eq!(hull.items_inserted(), 1);
    }

    #[test]
    fn test_contains() {
        let hull = Hull::with_capacity(1000, 0.01);
        hull.check_or_insert("item-1");
        assert!(hull.contains("item-1"));
        assert!(!hull.contains("item-2"));
    }

    #[test]
    fn test_clear() {
        let mut hull = Hull::with_capacity(1000, 0.01);
        hull.check_or_insert("item-1");
        hull.check_or_insert("item-2");
        assert_eq!(hull.items_inserted(), 2);
        assert!(hull.contains("item-1"));

        hull.clear();

        assert_eq!(hull.items_inserted(), 0);
        assert!(!hull.contains("item-1"));
    }

    #[test]
    fn test_roundtrip_serialization() {
        let hull = Hull::with_capacity(1000, 0.01);
        for i in 0..100 {
            hull.check_or_insert(&format!("item-{}", i));
        }
        assert_eq!(hull.items_inserted(), 100);

        let dir = tempdir().unwrap();
        let path = dir.path().join("bloom.bin");

        hull.save(&path).unwrap();

        let loaded = Hull::load(&path).unwrap();
        assert_eq!(loaded.items_inserted(), 100);

        for i in 0..100 {
            assert!(loaded.contains(&format!("item-{}", i)));
        }
    }

    #[test]
    fn test_corrupted_file_returns_fresh_filter() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("corrupted.bin");

        std::fs::write(&path, b"not a valid bloom filter").unwrap();

        let result = Hull::load(&path);
        assert!(result.is_ok());

        let fresh = result.unwrap();
        assert_eq!(fresh.items_inserted(), 0);
    }

    #[test]
    fn test_concurrent_inserts() {
        let hull = Arc::new(Hull::with_capacity(400_000, 0.01));
        let num_tasks = 8;
        let items_per_task = 50_000;

        let handles: Vec<_> = (0..num_tasks)
            .map(|task_id| {
                let hull = Arc::clone(&hull);
                std::thread::spawn(move || {
                    for i in 0..items_per_task {
                        hull.check_or_insert(&format!("uid-{}-{}", task_id, i));
                    }
                })
            })
            .collect();

        for handle in handles {
            handle.join().unwrap();
        }

        // Some items may be "duplicates" due to false positives from bloom filter
        // At 400K items with 1% FP rate, expect some FP losses
        let total = hull.items_inserted();
        let expected = (num_tasks * items_per_task) as u64;
        assert!(
            total >= expected - 5000,
            "At least {} items should be counted, got {}",
            expected - 5000,
            total
        );
    }

    #[tokio::test]
    async fn test_concurrent_inserts_async() {
        let hull = Arc::new(Hull::with_capacity(400_000, 0.01));
        let num_tasks = 8;
        let items_per_task = 50_000;

        let handles: Vec<_> = (0..num_tasks)
            .map(|task_id| {
                let hull = Arc::clone(&hull);
                tokio::spawn(async move {
                    for i in 0..items_per_task {
                        hull.check_or_insert(&format!("async-uid-{}-{}", task_id, i));
                    }
                })
            })
            .collect();

        for handle in handles {
            handle.await.unwrap();
        }

        let total = hull.items_inserted();
        let expected = (num_tasks * items_per_task) as u64;
        assert!(
            total >= expected - 5000,
            "At least {} items should be counted, got {}",
            expected - 5000,
            total
        );
    }

    #[test]
    fn test_false_positive_rate_at_capacity() {
        let hull = Hull::with_capacity(400_000, 0.01);

        for i in 0..400_000 {
            hull.check_or_insert(&format!("true-item-{}", i));
        }

        let mut false_positives = 0;
        let check_count = 100_000;
        for i in 400_000..400_000 + check_count {
            if hull.contains(&format!("false-item-{}", i)) {
                false_positives += 1;
            }
        }

        let fp_rate = false_positives as f64 / check_count as f64;
        assert!(
            fp_rate <= 0.015,
            "FP rate {}% should be <= 1.5%",
            fp_rate * 100.0
        );
    }
}
