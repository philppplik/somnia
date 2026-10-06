//! Room registry. A room is a fan-out channel: every frame a member sends is
//! forwarded to every *other* member. The relay keeps no document state and
//! never inspects payloads; a peer that joins an empty room simply hears
//! nothing until another member shows up (the clients run their own sync).

use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use bytes::Bytes;
use tokio::sync::{broadcast, watch};

/// One frame on its way through a room. `sender` lets receivers skip their
/// own echo without the relay ever looking inside `payload`.
#[derive(Clone, Debug)]
pub struct Relayed {
    pub sender: u64,
    pub payload: Bytes,
}

struct Room {
    tx: broadcast::Sender<Relayed>,
    members: u32,
    managed: Option<ManagedRoom>,
}

struct ManagedRoom {
    host_id: u64,
    expires: u64,
    ended: watch::Sender<u16>,
}

pub const MANAGED_ACK: &[u8] = b"\x04managed-room-v1";

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Expiry and a digest of the separate host capability are bound into the id.
/// A guest knows the id but cannot create/reopen the room without that capability.
pub fn managed_expiry(id: &str) -> Option<u64> {
    let (time, digest) = id.strip_prefix("m1_")?.split_once('_')?;
    if time.len() != 10
        || digest.len() != 64
        || !digest
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        return None;
    }
    time.parse().ok()
}
fn valid_host(id: &str, capability: &str) -> bool {
    if capability.len() != 43
        || !capability
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return false;
    }
    let Some(expires) = managed_expiry(id) else {
        return false;
    };
    let expected = format!(
        "m1_{expires}_{:x}",
        Sha256::digest(format!("somnia-room-v1:{expires}:{capability}"))
    );
    expected == id
}

#[derive(Debug, PartialEq, Eq)]
pub enum JoinError {
    /// Global room cap reached.
    TooManyRooms,
    /// Room has no free seat.
    RoomFull,
    Refused,
    Expired,
}

#[derive(Default)]
struct Registry {
    rooms: HashMap<String, Room>,
    // Tombstones remain until expiry so an ended room cannot be reopened. Bounded by max_rooms.
    ended: HashMap<String, u64>,
}

/// Thread-safe room registry. Cheap to clone: all clones share the registry.
#[derive(Clone)]
pub struct Rooms {
    inner: Arc<Mutex<Registry>>,
    max_rooms: usize,
    max_clients_per_room: u32,
    broadcast_capacity: usize,
    next_client_id: Arc<AtomicU64>,
}

pub struct Membership {
    pub client_id: u64,
    pub room_id: String,
    pub tag: String,
    pub rx: broadcast::Receiver<Relayed>,
    rooms: Rooms,
    pub ended: Option<watch::Receiver<u16>>,
    pub expires: Option<u64>,
}

impl Membership {
    /// Fan a frame out to every other member of the room.
    pub fn publish(&self, payload: Bytes) {
        let rooms = self.rooms.inner.lock().unwrap();
        if let Some(room) = rooms.rooms.get(&self.room_id) {
            if room
                .managed
                .as_ref()
                .is_some_and(|m| *m.ended.borrow() != 0 || unix_seconds() >= m.expires)
            {
                return;
            }
            // If nobody listens the frame is simply gone; an empty room holds
            // no state by design.
            let _ = room.tx.send(Relayed {
                sender: self.client_id,
                payload,
            });
        }
    }
}

impl Drop for Membership {
    fn drop(&mut self) {
        self.rooms.leave(&self.room_id, &self.tag, self.client_id);
    }
}

impl Rooms {
    pub fn new(max_rooms: usize, max_clients_per_room: u32, broadcast_capacity: usize) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Registry::default())),
            max_rooms,
            max_clients_per_room,
            broadcast_capacity,
            next_client_id: Arc::new(AtomicU64::new(1)),
        }
    }

    pub fn join(&self, room_id: &str, tag: String) -> Result<Membership, JoinError> {
        self.join_authorized(room_id, tag, None)
    }

    pub fn join_authorized(
        &self,
        room_id: &str,
        tag: String,
        host: Option<&str>,
    ) -> Result<Membership, JoinError> {
        let client_id = self.next_client_id.fetch_add(1, Ordering::Relaxed);
        let mut inner = self.inner.lock().unwrap();
        let now = unix_seconds();
        inner.ended.retain(|_, expires| *expires > now);
        let expires = if room_id.starts_with("m1_") {
            let expires = managed_expiry(room_id).ok_or(JoinError::Refused)?;
            if expires <= now {
                return Err(JoinError::Expired);
            }
            if expires > now + 86400 {
                return Err(JoinError::Refused);
            }
            Some(expires)
        } else {
            None
        };
        if inner.ended.contains_key(room_id) {
            return Err(JoinError::Refused);
        }
        if let Some(room) = inner.rooms.get(room_id) {
            if room
                .managed
                .as_ref()
                .is_some_and(|m| *m.ended.borrow() != 0)
            {
                return Err(JoinError::Refused);
            }
            // A second host is not allowed. Losing the only host ends the room.
            if expires.is_some() && host.is_some() {
                return Err(JoinError::Refused);
            }
        } else if expires.is_some() && !host.is_some_and(|h| valid_host(room_id, h)) {
            return Err(JoinError::Refused);
        }
        if !inner.rooms.contains_key(room_id)
            && inner.rooms.len() + inner.ended.len() >= self.max_rooms
        {
            return Err(JoinError::TooManyRooms);
        }
        let room = inner
            .rooms
            .entry(room_id.to_string())
            .or_insert_with(|| Room {
                tx: broadcast::channel(self.broadcast_capacity).0,
                members: 0,
                managed: expires.map(|expires| ManagedRoom {
                    host_id: client_id,
                    expires,
                    ended: watch::channel(0).0,
                }),
            });
        if room.members >= self.max_clients_per_room {
            return Err(JoinError::RoomFull);
        }
        room.members += 1;
        let rx = room.tx.subscribe();
        let ended = room.managed.as_ref().map(|m| m.ended.subscribe());
        Ok(Membership {
            client_id,
            room_id: room_id.to_string(),
            tag,
            rx,
            rooms: self.clone(),
            ended,
            expires,
        })
    }

    fn leave(&self, room_id: &str, tag: &str, client_id: u64) {
        let mut inner = self.inner.lock().unwrap();
        let ended_expiry = inner
            .rooms
            .get(room_id)
            .and_then(|room| room.managed.as_ref())
            .filter(|m| m.host_id == client_id)
            .map(|m| {
                m.ended.send_replace(4001);
                m.expires
            });
        if let Some(expires) = ended_expiry {
            inner.ended.insert(room_id.to_string(), expires);
        }
        if let Some(room) = inner.rooms.get_mut(room_id) {
            room.members -= 1;
            if room.members == 0 {
                tracing::debug!(room = %tag, "room closed (last member left)");
                inner.rooms.remove(room_id);
            }
        }
    }

    pub fn member_count(&self, room_id: &str) -> u32 {
        self.inner
            .lock()
            .unwrap()
            .rooms
            .get(room_id)
            .map(|r| r.members)
            .unwrap_or(0)
    }

    pub fn room_count(&self) -> usize {
        self.inner.lock().unwrap().rooms.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fanout_skips_sender() {
        let rooms = Rooms::new(8, 4, 16);
        let a = rooms.join("room-room-1", "tag1".into()).unwrap();
        let mut b = rooms.join("room-room-1", "tag1".into()).unwrap();
        a.publish(Bytes::from_static(b"hello"));
        let got = b.rx.try_recv().unwrap();
        assert_eq!(got.sender, a.client_id);
        assert_eq!(got.payload.as_ref(), b"hello");
    }

    #[test]
    fn room_cap_and_room_full() {
        let rooms = Rooms::new(1, 1, 16);
        let _a = rooms.join("room-room-1", "tag1".into()).unwrap();
        assert_eq!(
            rooms.join("room-room-1", "tag1".into()).err().unwrap(),
            JoinError::RoomFull
        );
        assert_eq!(
            rooms.join("room-room-2", "tag2".into()).err().unwrap(),
            JoinError::TooManyRooms
        );
    }

    #[test]
    fn empty_room_is_removed() {
        let rooms = Rooms::new(8, 4, 16);
        let a = rooms.join("room-room-1", "tag1".into()).unwrap();
        assert_eq!(rooms.room_count(), 1);
        drop(a);
        assert_eq!(rooms.room_count(), 0);
        assert_eq!(rooms.member_count("room-room-1"), 0);
    }

    #[test]
    fn lagging_receiver_reports_lagged() {
        let rooms = Rooms::new(8, 4, 2);
        let a = rooms.join("room-room-1", "tag1".into()).unwrap();
        let mut b = rooms.join("room-room-1", "tag1".into()).unwrap();
        for i in 0..5u8 {
            a.publish(Bytes::from(vec![i]));
        }
        assert!(matches!(
            b.rx.try_recv(),
            Err(broadcast::error::TryRecvError::Lagged(_))
        ));
    }
}
