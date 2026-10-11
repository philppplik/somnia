use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase { Idle, Preparing, Installing, Finishing, Success, Error, Cancelling, Cancelled }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Screen { Welcome, Options, License, Progress, Finish, Error, Cancelled }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Event { Start, Prepared, PayloadDone, Done, Fail, RequestCancel, CleanupDone, Resume }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Machine { pub phase: Phase }

impl Machine {
    pub fn new() -> Self { Self { phase: Phase::Idle } }

    /// The final phase must not be interruptible ("Finishing installation...").
    pub fn can_cancel(&self) -> bool {
        matches!(self.phase, Phase::Idle | Phase::Preparing | Phase::Installing | Phase::Error)
    }

    /// Returns false when the event is not valid in the current phase (state unchanged).
    pub fn apply(&mut self, e: Event) -> bool {
        use Event::*; use Phase::*;
        let next = match (self.phase, e) {
            (Idle, Start) => Preparing,
            (Preparing, Prepared) => Installing,
            (Installing, PayloadDone) => Finishing,
            (Finishing, Done) => Success,
            (Preparing | Installing | Finishing, Fail) => Error,
            (Preparing | Installing | Error, RequestCancel) => Cancelling,
            (Cancelling, CleanupDone) => Cancelled,
            (Error, Start) => Preparing, // Retry
            (Cancelled, Resume) => Idle,
            _ => return false,
        };
        self.phase = next;
        true
    }

    pub fn screen(&self) -> Screen {
        match self.phase {
            Phase::Idle => Screen::Welcome,
            Phase::Preparing | Phase::Installing | Phase::Finishing | Phase::Cancelling => Screen::Progress,
            Phase::Success => Screen::Finish,
            Phase::Error => Screen::Error,
            Phase::Cancelled => Screen::Cancelled,
        }
    }
}

impl Default for Machine { fn default() -> Self { Self::new() } }

/// Pre-install navigation (Welcome -> Options -> License -> Progress) keeps choices on Back.
pub fn next_pre_install(s: Screen) -> Option<Screen> {
    match s { Screen::Welcome => Some(Screen::Options), Screen::Options => Some(Screen::License), Screen::License => Some(Screen::Progress), _ => None }
}
pub fn back_pre_install(s: Screen) -> Option<Screen> {
    match s { Screen::Options => Some(Screen::Welcome), Screen::License => Some(Screen::Options), _ => None }
}
