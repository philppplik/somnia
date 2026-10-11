//! Deliberate best-effort failures. Replaces `let _ = fallible();` so every swallowed error is counted
//! and attributable to a closed reason. Counters are in-memory only and never logged per occurrence.
//!
//! ```ignore
//! ignore!(IgnoreReason::BestEffortWindow, window.emit("somnia://open-requests", payload));
//! ```
use std::sync::atomic::{AtomicU64, Ordering};

/// Closed set. New variants need a D1-F decision.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum IgnoreReason {
    /// Temp/backup file removal and similar cleanup after the real work finished.
    BestEffortCleanup,
    /// The user or caller cancelled; nothing to report.
    ExpectedCancel,
    /// Window event/focus/emit calls that fail when the window is already closing or gone.
    BestEffortWindow,
}

impl IgnoreReason {
    pub const ALL: [IgnoreReason; 3] = [IgnoreReason::BestEffortCleanup, IgnoreReason::ExpectedCancel, IgnoreReason::BestEffortWindow];
    pub const fn key(self) -> &'static str {
        match self {
            IgnoreReason::BestEffortCleanup => "best-effort-cleanup",
            IgnoreReason::ExpectedCancel => "expected-cancel",
            IgnoreReason::BestEffortWindow => "best-effort-window",
        }
    }
    const fn index(self) -> usize {
        self as usize
    }
}

static COUNTS: [AtomicU64; IgnoreReason::ALL.len()] = [AtomicU64::new(0), AtomicU64::new(0), AtomicU64::new(0)];

/// Anything `ignore!` can swallow.
pub trait Swallowable {
    fn failed(&self) -> bool;
}
impl<T, E> Swallowable for Result<T, E> {
    fn failed(&self) -> bool {
        self.is_err()
    }
}
impl<T> Swallowable for Option<T> {
    fn failed(&self) -> bool {
        self.is_none()
    }
}

#[doc(hidden)]
pub fn record<S: Swallowable>(reason: IgnoreReason, outcome: S) {
    if outcome.failed() {
        COUNTS[reason.index()].fetch_add(1, Ordering::Relaxed);
    }
}

/// Snapshot of how often each reason swallowed a failure (health report / diagnostics ZIP).
pub fn ignore_counts() -> Vec<(IgnoreReason, u64)> {
    IgnoreReason::ALL.iter().map(|r| (*r, COUNTS[r.index()].load(Ordering::Relaxed))).collect()
}

#[macro_export]
macro_rules! ignore {
    ($reason:expr, $e:expr) => {
        $crate::ignore::record($reason, $e)
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    fn count(r: IgnoreReason) -> u64 {
        ignore_counts().into_iter().find(|(x, _)| *x == r).unwrap().1
    }
    #[test]
    fn counts_only_failures_per_reason() {
        let before = (count(IgnoreReason::BestEffortWindow), count(IgnoreReason::ExpectedCancel));
        ignore!(IgnoreReason::BestEffortWindow, Err::<(), _>("gone"));
        ignore!(IgnoreReason::BestEffortWindow, None::<u8>);
        ignore!(IgnoreReason::BestEffortWindow, Ok::<_, ()>(1));
        ignore!(IgnoreReason::BestEffortWindow, Some(1));
        assert_eq!(count(IgnoreReason::BestEffortWindow), before.0 + 2);
        assert_eq!(count(IgnoreReason::ExpectedCancel), before.1);
    }
    #[test]
    fn keys_are_stable_and_unique() {
        let keys: std::collections::HashSet<_> = IgnoreReason::ALL.iter().map(|r| r.key()).collect();
        assert_eq!(keys.len(), IgnoreReason::ALL.len());
        assert!(keys.contains("best-effort-window"));
        for (i, r) in IgnoreReason::ALL.iter().enumerate() {
            assert_eq!(r.index(), i);
        }
    }
}
