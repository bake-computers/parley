use ed25519_dalek::{Signature, SignatureError, Signer, SigningKey, Verifier, VerifyingKey};

#[derive(Debug)]
pub enum SigningError {
    InvalidKeyLength { expected: usize, got: usize },
    InvalidHexEncoding(String),
    Ed25519Error(SignatureError),
    InternalError(String),
}

impl std::fmt::Display for SigningError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SigningError::InvalidKeyLength { expected, got } => {
                write!(
                    f,
                    "invalid key length: expected {expected} bytes, got {got}"
                )
            }
            SigningError::InvalidHexEncoding(msg) => {
                write!(f, "invalid hex encoding: {msg}")
            }
            SigningError::Ed25519Error(e) => {
                write!(f, "ed25519 error: {e}")
            }
            SigningError::InternalError(msg) => {
                write!(f, "internal error: {msg}")
            }
        }
    }
}

impl std::error::Error for SigningError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            SigningError::Ed25519Error(e) => Some(e),
            _ => None,
        }
    }
}

/// Sign a Discord interaction. Message = timestamp_bytes ++ body_bytes (NO delimiter).
/// Returns hex-encoded (lowercase) signature string.
pub fn sign_interaction(
    private_key: &[u8],
    timestamp: &str,
    body: &[u8],
) -> Result<String, SigningError> {
    let key_bytes: [u8; 32] =
        private_key
            .try_into()
            .map_err(|_| SigningError::InvalidKeyLength {
                expected: 32,
                got: private_key.len(),
            })?;

    let signing_key = SigningKey::from_bytes(&key_bytes);

    let mut message = Vec::with_capacity(timestamp.len() + body.len());
    message.extend_from_slice(timestamp.as_bytes());
    message.extend_from_slice(body);

    let signature = signing_key.sign(&message);
    Ok(hex::encode(signature.to_bytes()))
}

/// Verify a Discord interaction signature. Message = timestamp_bytes ++ body_bytes (NO delimiter).
pub fn verify_signature(
    public_key: &[u8],
    signature_hex: &str,
    timestamp: &str,
    body: &[u8],
) -> Result<bool, SigningError> {
    let key_bytes: [u8; 32] =
        public_key
            .try_into()
            .map_err(|_| SigningError::InvalidKeyLength {
                expected: 32,
                got: public_key.len(),
            })?;

    let sig_bytes =
        hex::decode(signature_hex).map_err(|e| SigningError::InvalidHexEncoding(e.to_string()))?;
    let sig_len = sig_bytes.len();
    let sig_arr: [u8; 64] = sig_bytes.try_into().map_err(|_| {
        SigningError::InvalidHexEncoding(format!("signature must be 64 bytes, got {}", sig_len))
    })?;
    let signature = Signature::from_bytes(&sig_arr);

    let verifying_key = VerifyingKey::from_bytes(&key_bytes).map_err(SigningError::Ed25519Error)?;

    let mut message = Vec::with_capacity(timestamp.len() + body.len());
    message.extend_from_slice(timestamp.as_bytes());
    message.extend_from_slice(body);

    match verifying_key.verify(&message, &signature) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // RFC 8032 §7.1 test vector 1 keypair
    const PRIVATE_KEY: [u8; 32] = [
        0x9d, 0x61, 0xb1, 0x9d, 0xef, 0xfd, 0x5a, 0x60, 0xba, 0x84, 0x4a, 0xf4, 0x92, 0xec, 0x2c,
        0xc4, 0x44, 0x49, 0xc5, 0x69, 0x7b, 0x32, 0x69, 0x19, 0x70, 0x3b, 0xac, 0x03, 0x1c, 0xae,
        0x7f, 0x60,
    ];

    const PUBLIC_KEY: [u8; 32] = [
        0xd7, 0x5a, 0x98, 0x01, 0x82, 0xb1, 0x0a, 0xb7, 0xd5, 0x4b, 0xfe, 0xd3, 0xc9, 0x64, 0x07,
        0x3a, 0x0e, 0xe1, 0x72, 0xf3, 0xda, 0xa6, 0x23, 0x25, 0xaf, 0x02, 0x1a, 0x68, 0xf7, 0x07,
        0x51, 0x1a,
    ];

    #[test]
    fn test_sign_and_verify_roundtrip() {
        let timestamp = "1234567890";
        let body = b"hello world";
        let sig_hex =
            sign_interaction(&PRIVATE_KEY, timestamp, body).expect("signing should succeed");
        let valid = verify_signature(&PUBLIC_KEY, &sig_hex, timestamp, body)
            .expect("verification should succeed");
        assert!(valid, "signature must verify for correct message");
    }

    #[test]
    fn test_verify_wrong_message_fails() {
        let timestamp = "1234567890";
        let body = b"hello world";
        let sig_hex =
            sign_interaction(&PRIVATE_KEY, timestamp, body).expect("signing should succeed");

        let wrong_body = b"goodbye world";
        let valid = verify_signature(&PUBLIC_KEY, &sig_hex, timestamp, wrong_body)
            .expect("verification should succeed structurally");
        assert!(!valid, "signature must not verify for wrong message");
    }

    #[test]
    fn test_verify_wrong_key_fails() {
        let timestamp = "1234567890";
        let body = b"hello world";
        let sig_hex =
            sign_interaction(&PRIVATE_KEY, timestamp, body).expect("signing should succeed");

        let bad_key = [0u8; 31];
        let result = verify_signature(&bad_key, &sig_hex, timestamp, body);
        assert!(
            matches!(result, Err(SigningError::InvalidKeyLength { .. })),
            "verifying with wrong-length key must return Err"
        );
    }

    #[test]
    fn test_invalid_key_length_error() {
        let short_key = [0u8; 31];
        let result = sign_interaction(&short_key, "1234567890", b"test");
        assert!(
            matches!(result, Err(SigningError::InvalidKeyLength { .. })),
            "signing with wrong-length key must return InvalidKeyLength"
        );
    }

    #[test]
    fn test_invalid_hex_signature_error() {
        let result = verify_signature(&PUBLIC_KEY, "not-hex", "1234567890", b"test");
        assert!(
            matches!(result, Err(SigningError::InvalidHexEncoding(_))),
            "verifying with non-hex signature must return InvalidHexEncoding"
        );
    }

    #[test]
    fn test_empty_body() {
        let timestamp = "9999999999";
        let body = b"";
        let sig_hex =
            sign_interaction(&PRIVATE_KEY, timestamp, body).expect("signing should succeed");
        let valid = verify_signature(&PUBLIC_KEY, &sig_hex, timestamp, body)
            .expect("verification should succeed");
        assert!(valid, "empty body must verify correctly");
    }

    #[test]
    fn test_large_body() {
        let timestamp = "1111111111";
        let body = vec![0xAB; 10_000];
        let sig_hex =
            sign_interaction(&PRIVATE_KEY, timestamp, &body).expect("signing should succeed");
        let valid = verify_signature(&PUBLIC_KEY, &sig_hex, timestamp, &body)
            .expect("verification should succeed");
        assert!(valid, "large body must verify correctly");
    }
}
