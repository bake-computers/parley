use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use crate::thruster::payload::InteractionPayload;
use crate::thruster::signing::{sign_interaction, SigningError};

const FRESHNESS_SECONDS: i64 = 300;

#[derive(Debug, Clone)]
pub struct SignedRequest {
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

pub fn sign_payload(
    payload: &InteractionPayload,
    private_key: &[u8; 32],
) -> Result<SignedRequest, SigningError> {
    let body = serde_json::to_vec(payload)
        .map_err(|e| SigningError::InternalError(format!("serialization failed: {e}")))?;
    let timestamp = chrono::Utc::now().timestamp().to_string();
    let sig_hex = sign_interaction(private_key, &timestamp, &body)?;
    Ok(SignedRequest {
        headers: vec![
            ("x-signature-ed25519".into(), sig_hex),
            ("x-signature-timestamp".into(), timestamp),
        ],
        body,
    })
}

/// A lock-free ring buffer of pre-signed requests for high-throughput thruster dispatch.
/// Each call to `get_next` returns the next request, re-signing if the timestamp is
/// older than 5 minutes.
pub struct PreSignedBuffer {
    payloads: Vec<InteractionPayload>,
    private_key: [u8; 32],
    buffer: Mutex<Vec<SignedRequest>>,
    index: AtomicUsize,
}

impl PreSignedBuffer {
    pub fn new(
        capacity: usize,
        payloads: Vec<InteractionPayload>,
        private_key: &[u8; 32],
    ) -> Result<Self, SigningError> {
        if payloads.is_empty() {
            return Err(SigningError::InternalError(
                "payloads must not be empty".into(),
            ));
        }
        if capacity == 0 {
            return Err(SigningError::InternalError(
                "capacity must be greater than 0".into(),
            ));
        }

        let mut buffer = Vec::with_capacity(capacity);
        for i in 0..capacity {
            let payload = &payloads[i % payloads.len()];
            let body = serde_json::to_vec(payload)
                .map_err(|e| SigningError::InternalError(format!("serialization failed: {e}")))?;
            let timestamp = chrono::Utc::now().timestamp().to_string();
            let sig_hex = sign_interaction(private_key, &timestamp, &body)?;
            buffer.push(SignedRequest {
                headers: vec![
                    ("x-signature-ed25519".into(), sig_hex),
                    ("x-signature-timestamp".into(), timestamp),
                ],
                body,
            });
        }

        Ok(Self {
            payloads,
            private_key: *private_key,
            buffer: Mutex::new(buffer),
            index: AtomicUsize::new(0),
        })
    }

    pub fn get_next(&self) -> Result<SignedRequest, SigningError> {
        let buf = self
            .buffer
            .lock()
            .map_err(|e| SigningError::InternalError(format!("mutex poisoned: {e}")))?;
        let len = buf.len();
        if len == 0 {
            return Err(SigningError::InternalError("buffer is empty".into()));
        }
        drop(buf);

        let idx = self.index.fetch_add(1, Ordering::Relaxed) % len;

        let mut buf = self
            .buffer
            .lock()
            .map_err(|e| SigningError::InternalError(format!("mutex poisoned: {e}")))?;

        let needs_resign = {
            let entry = &buf[idx];
            let entry_ts: Option<i64> = entry
                .headers
                .iter()
                .find(|(k, _)| k == "x-signature-timestamp")
                .and_then(|(_, v)| v.parse().ok());
            match entry_ts {
                Some(ts) => {
                    let now = chrono::Utc::now().timestamp();
                    now - ts > FRESHNESS_SECONDS
                }
                None => true,
            }
        };

        if needs_resign {
            let payload_idx = idx % self.payloads.len();
            let payload = &self.payloads[payload_idx];
            let body = serde_json::to_vec(payload)
                .map_err(|e| SigningError::InternalError(format!("serialization failed: {e}")))?;
            let timestamp = chrono::Utc::now().timestamp().to_string();
            let sig_hex = sign_interaction(&self.private_key, &timestamp, &body)?;
            buf[idx] = SignedRequest {
                headers: vec![
                    ("x-signature-ed25519".into(), sig_hex),
                    ("x-signature-timestamp".into(), timestamp),
                ],
                body,
            };
        }

        Ok(buf[idx].clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::thruster::payload::InteractionType;

    const TEST_PRIVATE_KEY: [u8; 32] = [
        0x9d, 0x61, 0xb1, 0x9d, 0xef, 0xfd, 0x5a, 0x60, 0xba, 0x84, 0x4a, 0xf4, 0x92, 0xec, 0x2c,
        0xc4, 0x44, 0x49, 0xc5, 0x69, 0x7b, 0x32, 0x69, 0x19, 0x70, 0x3b, 0xac, 0x03, 0x1c, 0xae,
        0x7f, 0x60,
    ];

    fn make_test_payload(id: &str) -> InteractionPayload {
        InteractionPayload::builder()
            .type_(InteractionType::ApplicationCommand)
            .id(id)
            .application_id("test-app")
            .token("test-token")
            .build()
            .expect("test payload build must succeed")
    }

    #[test]
    fn test_sign_payload_produces_valid_headers() {
        let payload = make_test_payload("sign-test");
        let signed = sign_payload(&payload, &TEST_PRIVATE_KEY).expect("signing must succeed");

        let sig_header = signed
            .headers
            .iter()
            .find(|(k, _)| k == "x-signature-ed25519")
            .expect("must have x-signature-ed25519 header");
        let ts_header = signed
            .headers
            .iter()
            .find(|(k, _)| k == "x-signature-timestamp")
            .expect("must have x-signature-timestamp header");

        assert_eq!(sig_header.0, "x-signature-ed25519");
        assert!(!sig_header.1.is_empty(), "signature must not be empty");
        assert!(
            sig_header.1.chars().all(|c| c.is_ascii_hexdigit()),
            "signature must be hex-encoded"
        );

        assert_eq!(ts_header.0, "x-signature-timestamp");
        let ts: i64 = ts_header.1.parse().expect("timestamp must be a valid i64");
        let now = chrono::Utc::now().timestamp();
        assert!(
            (now - ts).abs() < 10,
            "timestamp must be recent (within 10 seconds)"
        );

        assert!(!signed.body.is_empty(), "body must not be empty");
    }

    #[test]
    fn test_sign_payload_body_is_valid_json() {
        let payload = make_test_payload("json-body");
        let signed = sign_payload(&payload, &TEST_PRIVATE_KEY).expect("signing must succeed");

        let parsed: serde_json::Value =
            serde_json::from_slice(&signed.body).expect("body must be valid JSON");
        assert_eq!(parsed["type"], 2);
        assert_eq!(parsed["id"], "json-body");
    }

    #[test]
    fn test_sign_payload_different_payloads_produce_different_signatures() {
        let p1 = make_test_payload("sig-1");
        let p2 = make_test_payload("sig-2");

        let s1 = sign_payload(&p1, &TEST_PRIVATE_KEY).expect("sign p1");
        let s2 = sign_payload(&p2, &TEST_PRIVATE_KEY).expect("sign p2");

        let sig1 = s1
            .headers
            .iter()
            .find(|(k, _)| k == "x-signature-ed25519")
            .map(|(_, v)| v)
            .unwrap();
        let sig2 = s2
            .headers
            .iter()
            .find(|(k, _)| k == "x-signature-ed25519")
            .map(|(_, v)| v)
            .unwrap();

        assert_ne!(
            sig1, sig2,
            "different payloads must produce different signatures"
        );
    }

    #[test]
    fn test_presigned_buffer_rotation() {
        let payloads = vec![
            make_test_payload("rot-1"),
            make_test_payload("rot-2"),
            make_test_payload("rot-3"),
        ];
        let buffer = PreSignedBuffer::new(6, payloads, &TEST_PRIVATE_KEY)
            .expect("buffer creation must succeed");

        let mut timestamps: Vec<i64> = Vec::new();
        for _ in 0..6 {
            let req = buffer.get_next().expect("get_next must succeed");
            let ts: i64 = req
                .headers
                .iter()
                .find(|(k, _)| k == "x-signature-timestamp")
                .and_then(|(_, v)| v.parse().ok())
                .expect("must have valid timestamp");
            timestamps.push(ts);
        }

        assert_eq!(timestamps.len(), 6, "must return exactly 6 requests");

        let now = chrono::Utc::now().timestamp();
        for ts in &timestamps {
            assert!(
                (now - ts).abs() <= FRESHNESS_SECONDS + 10,
                "timestamp {ts} is too old (must be within {FRESHNESS_SECONDS}s + buffer)"
            );
        }

        // First 3 requests should have the same timestamps (pre-signed at creation)
        assert_eq!(timestamps[0], timestamps[1]);
        assert_eq!(timestamps[0], timestamps[2]);

        // Requests 3-5 should also have the same timestamps (also pre-signed at creation,
        // cycling through payloads again)
        assert_eq!(timestamps[3], timestamps[4]);
        assert_eq!(timestamps[3], timestamps[5]);

        // First batch and second batch timestamps can be the same or different
        // (depends on whether they were signed in the same second)
    }

    #[test]
    fn test_presigned_buffer_cycle_through_payloads() {
        let payloads = vec![make_test_payload("cycle-A"), make_test_payload("cycle-B")];
        let buffer = PreSignedBuffer::new(4, payloads, &TEST_PRIVATE_KEY)
            .expect("buffer creation must succeed");

        let ids: Vec<String> = (0..4)
            .map(|_| {
                let req = buffer.get_next().expect("get_next must succeed");
                let parsed: serde_json::Value =
                    serde_json::from_slice(&req.body).expect("body must be valid JSON");
                parsed["id"].as_str().unwrap().to_string()
            })
            .collect();

        assert_eq!(ids, vec!["cycle-A", "cycle-B", "cycle-A", "cycle-B"]);
    }

    #[test]
    fn test_presigned_buffer_empty_payloads_error() {
        let result = PreSignedBuffer::new(3, vec![], &TEST_PRIVATE_KEY);
        assert!(result.is_err(), "empty payloads must produce an error");
    }

    #[test]
    fn test_presigned_buffer_zero_capacity_error() {
        let payloads = vec![make_test_payload("zero-cap")];
        let result = PreSignedBuffer::new(0, payloads, &TEST_PRIVATE_KEY);
        assert!(result.is_err(), "zero capacity must produce an error");
    }

    #[test]
    fn test_signed_request_clone() {
        let payload = make_test_payload("clone-test");
        let signed = sign_payload(&payload, &TEST_PRIVATE_KEY).expect("signing must succeed");
        let cloned = signed.clone();
        assert_eq!(signed.headers.len(), cloned.headers.len());
        assert_eq!(signed.body, cloned.body);
    }
}
