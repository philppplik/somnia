//! somnia-relay library: room registry, admission and traffic limits, and the
//! WebSocket server. The relay is blind on purpose: every payload is an opaque
//! binary frame (clients encrypt end to end) and nothing is stored.

pub mod limits;
pub mod rooms;
pub mod server;

pub use rooms::{JoinError, Rooms};
pub use server::{serve, Config};

/// Minimum and maximum accepted room id length, in characters.
pub const ROOM_ID_MIN_LEN: usize = 8;
pub const ROOM_ID_MAX_LEN: usize = 128;

/// Returns true when `id` is a usable room id: 8-128 chars, URL-safe
/// (`A-Z a-z 0-9 - _`). Room ids are capability secrets; clients must generate
/// them with at least 128 bits of entropy (see README, "Security model").
pub fn valid_room_id(id: &str) -> bool {
    (ROOM_ID_MIN_LEN..=ROOM_ID_MAX_LEN).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// First 8 hex chars of SHA-256(room id), for logs. The relay never logs the
/// room id itself: it is the only credential a room has.
pub fn room_log_tag(id: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(id.as_bytes());
    digest[..4].iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn room_id_rules() {
        assert!(valid_room_id("aB09-_xyz123"));
        assert!(!valid_room_id("short"));
        assert!(!valid_room_id("has space in it"));
        assert!(!valid_room_id("slash/not-allowed"));
        assert!(!valid_room_id(&"x".repeat(129)));
        assert!(!valid_room_id(
            "unicode-\u{e4}\u{e4}\u{e4}\u{e4}\u{e4}\u{e4}\u{e4}\u{e4}"
        ));
    }

    #[test]
    fn log_tag_hides_id() {
        let tag = room_log_tag("super-secret-room-id-123");
        assert_eq!(tag.len(), 8);
        assert!(!"super-secret-room-id-123".contains(&tag));
    }
}
