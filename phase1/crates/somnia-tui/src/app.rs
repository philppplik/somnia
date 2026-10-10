//! TUI state and event reduction. Pure logic, no IO, fully unit-testable.
use crate::protocol::*;

#[derive(Debug, Clone, PartialEq)]
pub enum Entry {
    Text(String),
    Tool { id: String, name: String, summary: String, status: ToolStatus },
    Notice(String),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ToolStatus {
    Running,
    Ok,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Decision {
    Pending,
    Accept,
    Reject,
}

#[derive(Debug, Clone)]
pub struct Review {
    pub review_id: String,
    pub file: String,
    pub content_hash: String,
    pub hunks: Vec<Hunk>,
    pub decisions: Vec<Decision>,
    pub cursor: usize,
    /// Hash of the displayed content matches what the core sent.
    pub hash_ok: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RunState {
    Starting,
    Running,
    WaitingReview,
    NeedsInput,
    Done,
    Failed,
}

#[derive(Debug, Clone)]
pub struct App {
    pub task_id: String,
    pub prompt: String,
    pub model: String,
    pub branch: String,
    pub base_sha: String,
    pub result_sha: String,
    pub cost_usd: f64,
    pub tokens: u64,
    pub state: RunState,
    pub entries: Vec<Entry>,
    pub review: Option<Review>,
    pub guard: Option<String>,
    pub question: Option<String>,
    pub summary: String,
    pub scroll_up: usize,
    pub changed_files: Vec<String>,
    pub quit: bool,
    pub protocol_error: Option<String>,
    pub spinner: usize,
}

impl App {
    pub fn new() -> Self {
        App {
            task_id: String::new(),
            prompt: String::new(),
            model: String::new(),
            branch: String::new(),
            base_sha: String::new(),
            result_sha: String::new(),
            cost_usd: 0.0,
            tokens: 0,
            state: RunState::Starting,
            entries: vec![],
            review: None,
            guard: None,
            question: None,
            summary: String::new(),
            scroll_up: 0,
            changed_files: vec![],
            quit: false,
            protocol_error: None,
            spinner: 0,
        }
    }

    pub fn apply(&mut self, ev: Event) {
        match ev {
            Event::SessionStarted { task_id, prompt, branch, base_sha, model } => {
                self.task_id = sanitize(&task_id);
                self.prompt = sanitize(&prompt);
                self.branch = sanitize(&branch);
                self.base_sha = sanitize(&base_sha);
                self.model = sanitize(&model);
                self.state = RunState::Running;
            }
            Event::TextDelta { text } => {
                let t = sanitize(&text);
                match self.entries.last_mut() {
                    Some(Entry::Text(s)) => s.push_str(&t),
                    _ => self.entries.push(Entry::Text(t)),
                }
            }
            Event::ToolCall { id, name, summary } => self.entries.push(Entry::Tool {
                id: sanitize(&id),
                name: sanitize(&name),
                summary: sanitize(&summary),
                status: ToolStatus::Running,
            }),
            Event::ToolResult { id, status, summary } => {
                let id = sanitize(&id);
                for e in self.entries.iter_mut().rev() {
                    if let Entry::Tool { id: tid, status: st, summary: sm, .. } = e {
                        if *tid == id {
                            *st = if status == "ok" { ToolStatus::Ok } else { ToolStatus::Error };
                            if !summary.is_empty() {
                                *sm = sanitize(&summary);
                            }
                            break;
                        }
                    }
                }
            }
            Event::DiffProposed { review_id, file, content_hash, hunks } => {
                let file = sanitize(&file);
                let hunks: Vec<Hunk> = hunks
                    .into_iter()
                    .map(|h| Hunk {
                        id: sanitize(&h.id),
                        header: sanitize(&h.header),
                        lines: h.lines.iter().map(|l| sanitize(l)).collect(),
                    })
                    .collect();
                let n = hunks.len();
                self.review = Some(Review {
                    review_id: sanitize(&review_id),
                    file: file.clone(),
                    content_hash,
                    hunks,
                    decisions: vec![Decision::Pending; n],
                    cursor: 0,
                    hash_ok: true,
                });
                self.state = RunState::WaitingReview;
            }
            Event::GuardBlocked { reason } => self.guard = Some(sanitize(&reason)),
            Event::Status { cost_usd, tokens, branch, state } => {
                self.cost_usd = cost_usd;
                self.tokens = tokens;
                if !branch.is_empty() {
                    self.branch = sanitize(&branch);
                }
                let _ = state;
            }
            Event::NeedsInput { question } => {
                self.question = Some(sanitize(&question));
                self.state = RunState::NeedsInput;
            }
            Event::Done { status, result_sha, summary } => {
                self.result_sha = sanitize(&result_sha);
                self.summary = sanitize(&summary);
                self.state = match status.as_str() {
                    "done" => RunState::Done,
                    "needs_input" => RunState::NeedsInput,
                    _ => RunState::Failed,
                };
            }
        }
    }

    /// Process-level exit code per C4: 0 done, 1 failed, 2 needs-input.
    pub fn exit_code(&self) -> i32 {
        match self.state {
            RunState::Done => 0,
            RunState::NeedsInput | RunState::WaitingReview => 2,
            _ => 1,
        }
    }

    pub fn finished(&self) -> bool {
        matches!(self.state, RunState::Done | RunState::Failed)
    }
}

impl Review {
    /// Recompute the binding hash. Called with the raw (unsanitized) hunks at
    /// receipt time; see `Review::from_event`.
    pub fn from_event(review_id: String, file: String, content_hash: String, hunks: Vec<Hunk>) -> Review {
        let hash_ok = review_hash(&file, &hunks) == content_hash;
        let n = hunks.len();
        Review { review_id, file, content_hash, hunks, decisions: vec![Decision::Pending; n], cursor: 0, hash_ok }
    }

    pub fn all_decided(&self) -> bool {
        !self.decisions.is_empty() && self.decisions.iter().all(|d| *d != Decision::Pending)
    }

    pub fn set(&mut self, d: Decision) {
        if let Some(x) = self.decisions.get_mut(self.cursor) {
            *x = d;
        }
    }

    pub fn move_cursor(&mut self, delta: i32) {
        let n = self.hunks.len() as i32;
        if n > 0 {
            self.cursor = (self.cursor as i32 + delta).rem_euclid(n) as usize;
        }
    }
}

/// Result of a key press that the IO layer must act upon.
#[derive(Debug, PartialEq)]
pub enum Action {
    None,
    Send(Command),
    Quit,
}

impl App {
    /// Replace the review built in `apply` with a hash-verified one. The IO layer
    /// calls this with the raw event, so the hash is checked on unsanitized data.
    pub fn apply_raw(&mut self, ev: Event) {
        if let Event::DiffProposed { review_id, file, content_hash, hunks } = &ev {
            let verified = Review::from_event(review_id.clone(), file.clone(), content_hash.clone(), hunks.clone());
            self.apply(ev);
            if let Some(r) = self.review.as_mut() {
                r.hash_ok = verified.hash_ok;
            }
            return;
        }
        self.apply(ev);
    }

    pub fn on_key(&mut self, code: char, ctrl: bool, enter: bool, esc: bool, up: bool, down: bool) -> Action {
        if ctrl && code == 'c' {
            return if self.finished() { Action::Quit } else { Action::Send(Command::Cancel) };
        }
        if let Some(r) = self.review.as_mut() {
            if up || code == 'k' {
                r.move_cursor(-1);
                return Action::None;
            }
            if down || code == 'j' {
                r.move_cursor(1);
                return Action::None;
            }
            match code {
                'a' => { r.set(Decision::Accept); r.move_cursor(1); return Action::None; }
                'r' => { r.set(Decision::Reject); r.move_cursor(1); return Action::None; }
                'A' => { for d in r.decisions.iter_mut() { *d = Decision::Accept; } return Action::None; }
                'R' => { for d in r.decisions.iter_mut() { *d = Decision::Reject; } return Action::None; }
                _ => {}
            }
            if enter {
                // BLOCKER: unsaved-buffer guard or hash mismatch can never be approved.
                if self.guard.is_some() || !r.hash_ok || !r.all_decided() {
                    return Action::None;
                }
                let mut acc = vec![];
                let mut rej = vec![];
                for (h, d) in r.hunks.iter().zip(&r.decisions) {
                    if *d == Decision::Accept { acc.push(h.id.clone()) } else { rej.push(h.id.clone()) }
                }
                let cmd = Command::ReviewDecision {
                    review_id: r.review_id.clone(),
                    content_hash: r.content_hash.clone(),
                    accepted_hunks: acc,
                    rejected_hunks: rej,
                };
                if let Some(r) = self.review.take() {
                    self.changed_files.push(r.file);
                }
                self.state = RunState::Running;
                return Action::Send(cmd);
            }
            if esc {
                return Action::None;
            }
        }
        match code {
            'q' if self.finished() => Action::Quit,
            'q' => Action::Send(Command::Cancel),
            'k' | 'K' if up => { self.scroll_up += 1; Action::None }
            _ => {
                if up { self.scroll_up += 1 }
                if down { self.scroll_up = self.scroll_up.saturating_sub(1) }
                Action::None
            }
        }
    }
}
