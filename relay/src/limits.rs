//! Rate limits. Same idea as the collab spike's `limits.mjs` (token buckets,
//! per-address handshake gate), tuned for a small self-hosted internet relay
//! where several honest users may share one public IP (NAT, office).

use std::collections::{HashMap, VecDeque};
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Classic token bucket. `rate` tokens refill per second up to `burst`.
pub struct TokenBucket {
    rate: f64,
    burst: f64,
    tokens: f64,
    last: Instant,
}

impl TokenBucket {
    pub fn new(rate: f64, burst: f64) -> Self {
        Self {
            rate,
            burst,
            tokens: burst,
            last: Instant::now(),
        }
    }

    pub fn take(&mut self, n: f64) -> bool {
        let now = Instant::now();
        let refill = now.duration_since(self.last).as_secs_f64() * self.rate;
        self.tokens = (self.tokens + refill).min(self.burst);
        self.last = now;
        if self.tokens < n {
            return false;
        }
        self.tokens -= n;
        true
    }
}

/// Per-connection traffic budget: frames/s and bytes/s.
pub struct TrafficLimiter {
    frames: TokenBucket,
    bytes: TokenBucket,
}

impl TrafficLimiter {
    pub fn new(frames_per_sec: u32, frame_burst: u32, bytes_per_sec: u64, byte_burst: u64) -> Self {
        Self {
            frames: TokenBucket::new(frames_per_sec as f64, frame_burst as f64),
            bytes: TokenBucket::new(bytes_per_sec as f64, byte_burst as f64),
        }
    }

    pub fn allow(&mut self, frame_bytes: usize) -> bool {
        // Take from both buckets; never refund. A client either fits its
        // budget or gets disconnected, partial accounting does not matter.
        self.frames.take(1.0) && self.bytes.take(frame_bytes as f64)
    }
}

#[derive(Default)]
struct IpState {
    handshakes: VecDeque<Instant>,
    open: u32,
}

/// Per-source-IP admission limits applied at the WebSocket handshake.
pub struct IpLimiter {
    handshakes_per_min: u32,
    max_open_per_ip: u32,
    states: Mutex<HashMap<IpAddr, IpState>>,
}

pub enum Admission {
    Ok,
    /// Too many handshakes in the last minute.
    TooManyHandshakes,
    /// Too many open connections from this address.
    TooManyConnections,
}

impl IpLimiter {
    pub fn new(handshakes_per_min: u32, max_open_per_ip: u32) -> Self {
        Self {
            handshakes_per_min,
            max_open_per_ip,
            states: Mutex::new(HashMap::new()),
        }
    }

    /// Call once per incoming TCP connection, before the handshake.
    pub fn admit(&self, ip: IpAddr) -> Admission {
        let mut states = self.states.lock().unwrap();
        let state = states.entry(ip).or_default();
        let now = Instant::now();
        while state
            .handshakes
            .front()
            .is_some_and(|t| now.duration_since(*t) > Duration::from_secs(60))
        {
            state.handshakes.pop_front();
        }
        if state.handshakes.len() as u32 >= self.handshakes_per_min {
            return Admission::TooManyHandshakes;
        }
        if state.open >= self.max_open_per_ip {
            return Admission::TooManyConnections;
        }
        state.handshakes.push_back(now);
        Admission::Ok
    }

    /// Call after the WebSocket upgrade succeeded.
    pub fn opened(&self, ip: IpAddr) {
        self.states.lock().unwrap().entry(ip).or_default().open += 1;
    }

    /// Call when the connection ends.
    pub fn closed(&self, ip: IpAddr) {
        let mut states = self.states.lock().unwrap();
        if let Some(state) = states.get_mut(&ip) {
            state.open = state.open.saturating_sub(1);
            if state.open == 0 && state.handshakes.is_empty() {
                states.remove(&ip);
            }
        }
    }

    /// Drop stale entries so the map stays small. Call periodically.
    pub fn sweep(&self) {
        let now = Instant::now();
        self.states.lock().unwrap().retain(|_, s| {
            s.open > 0
                || s.handshakes
                    .back()
                    .is_some_and(|t| now.duration_since(*t) <= Duration::from_secs(60))
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn token_bucket_drains_and_refills() {
        let mut b = TokenBucket::new(10.0, 5.0);
        for _ in 0..5 {
            assert!(b.take(1.0));
        }
        assert!(!b.take(1.0));
        std::thread::sleep(Duration::from_millis(150));
        assert!(b.take(1.0));
    }

    #[test]
    fn traffic_limiter_counts_bytes() {
        let mut t = TrafficLimiter::new(1000, 1000, 100, 200);
        assert!(t.allow(150));
        assert!(t.allow(50));
        assert!(!t.allow(1));
    }

    #[test]
    fn ip_limiter_open_cap() {
        let l = IpLimiter::new(100, 2);
        let ip = IpAddr::V4(Ipv4Addr::LOCALHOST);
        assert!(matches!(l.admit(ip), Admission::Ok));
        l.opened(ip);
        assert!(matches!(l.admit(ip), Admission::Ok));
        l.opened(ip);
        assert!(matches!(l.admit(ip), Admission::TooManyConnections));
        l.closed(ip);
        assert!(matches!(l.admit(ip), Admission::Ok));
    }

    #[test]
    fn ip_limiter_handshake_cap() {
        let l = IpLimiter::new(3, 100);
        let ip = IpAddr::V4(Ipv4Addr::LOCALHOST);
        assert!(matches!(l.admit(ip), Admission::Ok));
        assert!(matches!(l.admit(ip), Admission::Ok));
        assert!(matches!(l.admit(ip), Admission::Ok));
        assert!(matches!(l.admit(ip), Admission::TooManyHandshakes));
    }
}
