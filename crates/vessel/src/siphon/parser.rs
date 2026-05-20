//! Username extraction from scraped stats pages.
//!
//! Siphon is a graph crawler: given a seed username, it discovers connected
//! players (teammates, opponents) and recursively feeds them back into the
//! queue. The downstream [`StatsClient`](stats_scraper::fetch::StatsClient)
//! resolves profiles via stats.cc's `?displayName=…` lookup, so this module
//! must produce **display-name strings**, not UUIDs — UUID-only references
//! are not resolvable as profiles.
//!
//! Stats.cc embeds canonical profile URLs of the form
//! `/siege/{username}/{uuid}` inside its `__NUXT_DATA__` payload (for the
//! viewed player and for every linked opponent/teammate). Plain
//! `/player/{uuid}` references appear too but carry no display name, so
//! they're skipped — there is no way to crawl them without a separate
//! resolution step.

use simd_json::prelude::*;
use simd_json::BorrowedValue;
use stats_scraper::nuxt::NuxtResolver;
use stats_scraper::scrape::extract_nuxt_payload;

/// Maximum total usernames returned by [`extract_opponent_usernames_from_html`].
const MAX_TOTAL: usize = 100;

/// Returns true when `s` matches the structural UUID v4 pattern:
/// 8-4-4-4-12 hex digits with dashes at positions 8, 13, 18, 23.
fn looks_like_uuid(s: &str) -> bool {
    let bytes = s.as_bytes();
    bytes.len() == 36
        && bytes[8] == b'-'
        && bytes[13] == b'-'
        && bytes[18] == b'-'
        && bytes[23] == b'-'
        && bytes.iter().all(|b| b.is_ascii_hexdigit() || *b == b'-')
}

/// Decode `%XX` escapes in a URL path segment.
///
/// Returns `None` when the input contains an invalid `%XX` sequence so the
/// caller can fall back to skipping the entry rather than feeding malformed
/// text downstream.
fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
            let byte = u8::from_str_radix(hex, 16).ok()?;
            out.push(byte as char);
            i += 3;
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }
    Some(out)
}

/// Extract `(username, uuid)` from a `/siege/{username}/{uuid}` URL fragment.
///
/// Returns `None` when the path doesn't have the expected shape, the UUID
/// portion isn't structurally valid, or the username can't be percent-decoded.
fn extract_username_from_siege_url(s: &str) -> Option<String> {
    let pos = s.find("/siege/")?;
    let after = &s[pos + 7..];
    // Expect "{username}/{uuid}…" where the UUID is exactly 36 chars.
    let slash = after.find('/')?;
    let username_part = &after[..slash];
    let after_name = &after[slash + 1..];
    let uuid_candidate = after_name.get(..36)?;
    if !looks_like_uuid(uuid_candidate) {
        return None;
    }
    let username = percent_decode(username_part)?;
    let trimmed = username.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

/// Extract opponent / teammate usernames from raw stats.cc HTML by walking
/// the `__NUXT_DATA__` payload and collecting every `/siege/{username}/{uuid}`
/// URL string.
///
/// Returns a deduplicated, sorted `Vec<String>` of display names. Up to
/// [`MAX_TOTAL`] entries are returned to bound output size on densely linked
/// pages.
pub fn extract_opponent_usernames_from_html(html: &str) -> Vec<String> {
    let payload_str = match extract_nuxt_payload(html) {
        Some(s) => s,
        None => return Vec::new(),
    };

    let mut bytes = payload_str.as_bytes().to_vec();
    let parsed: BorrowedValue = match simd_json::to_borrowed_value(&mut bytes) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let Some(arr) = parsed.as_array() else {
        return Vec::new();
    };
    let payload: &[BorrowedValue] = arr;
    let resolver = NuxtResolver::new(payload);
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for value in resolver.payload() {
        let resolved = resolver.resolve(value);
        if let Some(s) = resolved.as_str() {
            if let Some(username) = extract_username_from_siege_url(s) {
                seen.insert(username);
                if seen.len() >= MAX_TOTAL {
                    break;
                }
            }
        }
    }

    let mut out: Vec<String> = seen.into_iter().collect();
    out.sort();
    out.truncate(MAX_TOTAL);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn html_with_payload(json_array: &str) -> String {
        format!(
            "<html><script id=\"__NUXT_DATA__\" type=\"application/json\">{}</script></html>",
            json_array
        )
    }

    #[test]
    fn test_looks_like_uuid_valid() {
        assert!(looks_like_uuid("aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee"));
        assert!(looks_like_uuid("11111111-2222-4333-9444-555555555555"));
        assert!(looks_like_uuid("ABCDEFAB-1234-5678-9ABC-DEF012345678"));
    }

    #[test]
    fn test_looks_like_uuid_invalid() {
        assert!(!looks_like_uuid(""));
        assert!(!looks_like_uuid("not-a-uuid"));
        assert!(!looks_like_uuid("aaaaaaaa-bbbb-4ccc-9ddd")); // too short
                                                              // wrong dash positions
        assert!(!looks_like_uuid("aaaaaaaa-bbbb4ccc-9ddd-eeeeeeeeeeee"));
        // non-hex chars
        assert!(!looks_like_uuid("aaaaaaag-bbbb-4ccc-9ddd-eeeeeeeeeeee"));
    }

    #[test]
    fn test_extract_username_from_siege_url_basic() {
        let url = "/siege/SomePlayer/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";
        assert_eq!(
            extract_username_from_siege_url(url),
            Some("SomePlayer".to_string())
        );
    }

    #[test]
    fn test_extract_username_from_siege_url_percent_decoded() {
        let url = "/siege/Pengu.PSG/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";
        assert_eq!(
            extract_username_from_siege_url(url),
            Some("Pengu.PSG".to_string())
        );

        let url = "/siege/Some%20Player/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";
        assert_eq!(
            extract_username_from_siege_url(url),
            Some("Some Player".to_string())
        );
    }

    #[test]
    fn test_extract_username_from_siege_url_rejects_invalid_uuid() {
        let url = "/siege/SomePlayer/not-a-uuid";
        assert_eq!(extract_username_from_siege_url(url), None);
    }

    #[test]
    fn test_extract_username_from_siege_url_rejects_player_form() {
        // /player/{uuid} carries no username, must not match.
        let url = "/player/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";
        assert_eq!(extract_username_from_siege_url(url), None);
    }

    #[test]
    fn test_extract_opponent_usernames_basic() {
        let html = html_with_payload(
            r#"["/siege/Alice/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee", "/siege/Bob/11111111-2222-4333-9444-555555555555"]"#,
        );
        let names = extract_opponent_usernames_from_html(&html);
        assert_eq!(names.len(), 2);
        assert!(names.contains(&"Alice".to_string()));
        assert!(names.contains(&"Bob".to_string()));
    }

    #[test]
    fn test_extract_opponent_usernames_no_nuxt_payload() {
        let html = "<html><body>no data</body></html>";
        let names = extract_opponent_usernames_from_html(html);
        assert!(names.is_empty());
    }

    #[test]
    fn test_extract_opponent_usernames_empty_payload() {
        let html = html_with_payload("[]");
        let names = extract_opponent_usernames_from_html(&html);
        assert!(names.is_empty());
    }

    #[test]
    fn test_extract_opponent_usernames_dedup() {
        let html = html_with_payload(
            r#"["/siege/Alice/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee", "/siege/Alice/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee"]"#,
        );
        let names = extract_opponent_usernames_from_html(&html);
        assert_eq!(names, vec!["Alice".to_string()]);
    }

    #[test]
    fn test_extract_opponent_usernames_skips_player_form() {
        // /player/{uuid} carries no name → ignored.
        let html = html_with_payload(
            r#"["/player/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee", "/siege/RealPlayer/11111111-2222-4333-9444-555555555555"]"#,
        );
        let names = extract_opponent_usernames_from_html(&html);
        assert_eq!(names, vec!["RealPlayer".to_string()]);
    }

    #[test]
    fn test_extract_opponent_usernames_via_nuxt_reference() {
        // Simulate Nuxt indirect reference: payload[0] → 1, payload[1] = "/siege/X/uuid"
        let html =
            html_with_payload(r#"[1, "/siege/Indirect/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee"]"#);
        let names = extract_opponent_usernames_from_html(&html);
        assert_eq!(names, vec!["Indirect".to_string()]);
    }

    #[test]
    fn test_extract_opponent_usernames_ignores_nested_objects() {
        let html = html_with_payload(
            r#"[{"player_url": "/siege/Hidden/aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee"}, "/siege/Visible/bbbbbbbb-cccc-4ddd-9eee-ffffffffffff"]"#,
        );
        let names = extract_opponent_usernames_from_html(&html);
        assert_eq!(names, vec!["Visible".to_string()]);
    }
}
