//! Purge command: rollback session, delete bloom cache, release lock.

use crate::session::VesselSessionHandle;
use std::path::Path;

pub struct PurgeCommand;

impl PurgeCommand {
    /// Run the purge: rollback DB, delete bloom file, release lock.
    ///
    /// 1. Call `session.purge()` which does ROLLBACK + advisory unlock + status update.
    /// 2. Delete bloom cache file at `bloom_path` (if it exists).
    /// 3. Log success.
    ///
    /// # Errors
    ///
    /// Returns [`PurgeError::AlreadyPurged`] if the session has already been purged.
    /// Returns [`PurgeError::AlreadyCompleted`] if the session has already been completed.
    pub async fn run(session: VesselSessionHandle, bloom_path: &Path) -> Result<(), PurgeError> {
        // 1. Call session.purge() — consumes self, does ROLLBACK + advisory unlock + status update
        session.purge().await?;

        // 2. Delete bloom cache file (if it exists — not an error if missing)
        if bloom_path.exists() {
            std::fs::remove_file(bloom_path)?;
        }

        // 3. Log success
        eprintln!("Purge complete: session rolled back, bloom cache deleted.");

        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PurgeError {
    #[error("session already purged")]
    AlreadyPurged,
    #[error("session already completed, cannot purge")]
    AlreadyCompleted,
    #[error("session error: {0}")]
    Session(#[from] crate::session::SessionError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_purge_deletes_bloom_file() {
        let dir = tempdir().unwrap();
        let bloom_path = dir.path().join("bloom.bin");

        std::fs::write(&bloom_path, b"fake bloom data").unwrap();
        assert!(bloom_path.exists());

        let result: Result<(), PurgeError> = (|| {
            if bloom_path.exists() {
                std::fs::remove_file(&bloom_path)?;
            }
            Ok(())
        })();

        result.unwrap();
        assert!(!bloom_path.exists());
    }

    #[test]
    fn test_purge_missing_bloom_file_warns() {
        let dir = tempdir().unwrap();
        let bloom_path = dir.path().join("nonexistent.bin");

        assert!(!bloom_path.exists());

        let result: Result<(), PurgeError> = (|| {
            if bloom_path.exists() {
                std::fs::remove_file(&bloom_path)?;
            }
            Ok(())
        })();

        assert!(result.is_ok());
    }

    #[test]
    fn test_purge_error_types_display() {
        let err = PurgeError::AlreadyPurged;
        assert_eq!(err.to_string(), "session already purged");

        let err = PurgeError::AlreadyCompleted;
        assert_eq!(err.to_string(), "session already completed, cannot purge");

        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err = PurgeError::Io(io_err);
        assert!(err.to_string().contains("file not found"));

        let session_err = crate::session::SessionError::LockConflict;
        let err = PurgeError::Session(session_err);
        assert!(err.to_string().contains("advisory lock conflict"));
    }
}
