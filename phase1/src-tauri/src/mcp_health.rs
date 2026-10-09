//! DRAFT (unverified, needs CI): restart/backoff policy for MCP servers that exit on their own.
//! Pure logic, no I/O and no clock: the caller passes monotonic milliseconds. Nothing here starts
//! a process; the host asks `on_exit` what to do and the UI shows the state. A server the user
//! stopped is never restarted (`on_user_stop`).
use serde::Serialize;

pub const BASE_DELAY_MS: u64 = 1_000;
pub const MAX_DELAY_MS: u64 = 60_000;
pub const MAX_ATTEMPTS: u32 = 5;
/// A server that stayed up this long counts as healthy and resets the attempt counter.
pub const STABLE_AFTER_MS: u64 = 60_000;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Health {
    Stopped,
    Running { since_ms: u64 },
    /// Will be restarted at or after `at_ms` (attempt number starts at 1).
    Restarting { at_ms: u64, attempt: u32 },
    /// Gave up after MAX_ATTEMPTS. The user must press Start again.
    Failed { attempts: u32 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Supervisor {
    health: Health,
    attempts: u32,
}

impl Default for Supervisor {
    fn default() -> Self { Self { health: Health::Stopped, attempts: 0 } }
}

pub fn delay_for(attempt: u32) -> u64 {
    let shift = attempt.saturating_sub(1).min(16);
    (BASE_DELAY_MS << shift).min(MAX_DELAY_MS)
}

impl Supervisor {
    pub fn health(&self) -> Health { self.health }
    /// The server (re)started successfully at `now_ms`.
    pub fn on_started(&mut self, now_ms: u64) { self.health = Health::Running { since_ms: now_ms }; }
    /// The user pressed Stop or Remove. Cancels any pending restart and clears the counter.
    pub fn on_user_stop(&mut self) { self.health = Health::Stopped; self.attempts = 0; }
    /// The user pressed Start by hand (also the way out of `Failed`).
    pub fn on_user_start(&mut self) { self.attempts = 0; }
    /// The server process ended or a call found it dead. Returns the new state.
    pub fn on_exit(&mut self, now_ms: u64) -> Health {
        if matches!(self.health, Health::Stopped | Health::Failed { .. }) { return self.health; }
        if let Health::Running { since_ms } = self.health {
            if now_ms.saturating_sub(since_ms) >= STABLE_AFTER_MS { self.attempts = 0; }
        }
        self.attempts += 1;
        self.health = if self.attempts > MAX_ATTEMPTS {
            Health::Failed { attempts: self.attempts - 1 }
        } else {
            Health::Restarting { at_ms: now_ms + delay_for(self.attempts), attempt: self.attempts }
        };
        self.health
    }
    /// True when a restart is due now.
    pub fn restart_due(&self, now_ms: u64) -> bool {
        matches!(self.health, Health::Restarting { at_ms, .. } if now_ms >= at_ms)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_doubles_and_caps() {
        assert_eq!([1, 2, 3, 4, 5, 6, 7, 40].map(delay_for), [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]);
    }

    #[test]
    fn crash_loop_gives_up_after_five_attempts() {
        let mut s = Supervisor::default();
        s.on_started(0);
        let mut now = 100;
        for n in 1..=MAX_ATTEMPTS {
            assert_eq!(s.on_exit(now), Health::Restarting { at_ms: now + delay_for(n), attempt: n });
            assert!(!s.restart_due(now));
            now += delay_for(n);
            assert!(s.restart_due(now));
            s.on_started(now);
            now += 10;
        }
        assert_eq!(s.on_exit(now), Health::Failed { attempts: MAX_ATTEMPTS });
        assert_eq!(s.on_exit(now + 1), Health::Failed { attempts: MAX_ATTEMPTS });
        s.on_user_start();
        s.on_started(now + 5);
        assert!(matches!(s.on_exit(now + 6), Health::Restarting { attempt: 1, .. }));
    }

    #[test]
    fn stable_run_resets_the_counter() {
        let mut s = Supervisor::default();
        s.on_started(0);
        s.on_exit(10);
        s.on_started(2_000);
        assert!(matches!(s.on_exit(2_000 + STABLE_AFTER_MS), Health::Restarting { attempt: 1, .. }));
    }

    #[test]
    fn user_stop_is_never_restarted() {
        let mut s = Supervisor::default();
        s.on_started(0);
        s.on_user_stop();
        assert_eq!(s.on_exit(5), Health::Stopped);
        assert!(!s.restart_due(1_000_000));
    }
}
