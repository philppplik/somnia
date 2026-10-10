//! Review/hunk model for the TUI adapter. Minimum that lets a reviewer accept or reject hunks of the
//! uncommitted agent work (L0 gate). Everything here is local: diff, reverse-apply, nothing else.
//!
//! The content hash is the S12 formula, owned by this module only:
//!   hex(sha256( file \0 ( hunk.id \0 lines.join("\n") \0 )* ))
//! `lines` are the diff body lines with their leading '+', '-' or ' ' marker ("\ No newline" markers excluded).
use crate::error::{CliError, ErrorKind, Result};
use crate::gitops;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Hunk {
    pub id: String,
    pub header: String,
    pub lines: Vec<String>,
    /// Raw patch text of this hunk (header line + body, incl. "\ No newline" markers). Not part of the wire format.
    #[serde(skip)]
    pub raw: String,
}

#[derive(Debug, Clone)]
pub struct FileReview {
    pub review_id: String,
    pub file: String,
    /// Patch preamble (everything before the first `@@`), needed to re-apply hunks.
    pub preamble: String,
    pub hunks: Vec<Hunk>,
    pub content_hash: String,
    pub decided: bool,
}

pub fn content_hash(file: &str, hunks: &[Hunk]) -> String {
    let mut h = Sha256::new();
    h.update(file.as_bytes());
    h.update([0]);
    for hk in hunks {
        h.update(hk.id.as_bytes());
        h.update([0]);
        h.update(hk.lines.join("\n").as_bytes());
        h.update([0]);
    }
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Split a single-file unified diff into (preamble, hunks). Hunk ids are positional (`h1`, `h2`, ...).
pub fn parse_file_diff(diff: &str) -> (String, Vec<Hunk>) {
    let mut preamble = String::new();
    let mut hunks: Vec<Hunk> = vec![];
    for line in diff.split_inclusive('\n') {
        if line.starts_with("@@") {
            let n = hunks.len() + 1;
            hunks.push(Hunk { id: format!("h{n}"), header: line.trim_end().to_string(), lines: vec![], raw: line.to_string() });
        } else if let Some(h) = hunks.last_mut() {
            h.raw.push_str(line);
            let l = line.strip_suffix('\n').unwrap_or(line);
            if !l.starts_with('\\') {
                h.lines.push(l.to_string());
            }
        } else {
            preamble.push_str(line);
        }
    }
    (preamble, hunks)
}

fn diff_for(root: &Path, file: &str) -> Result<String> {
    gitops::git_raw(root, &["diff", "--no-color", "--no-ext-diff", "--no-renames", "-U3", "HEAD", "--", file])
}

/// Build one review per changed file. New files are made visible with intent-to-add, which is undone right after.
pub fn build_reviews(root: &Path, task_id: &str, paths: &[String]) -> Result<Vec<FileReview>> {
    let mut out = vec![];
    for (i, p) in paths.iter().enumerate() {
        let _ = gitops::git(root, &["add", "-N", "--", p], None);
        let d = diff_for(root, p);
        let _ = gitops::git(root, &["reset", "-q", "--", p], None);
        let (preamble, hunks) = parse_file_diff(&d?);
        if hunks.is_empty() {
            continue; // binary / mode-only change: not reviewable hunk-wise
        }
        let content_hash = content_hash(p, &hunks);
        out.push(FileReview { review_id: format!("{task_id}-r{}", i + 1), file: p.clone(), preamble, hunks, content_hash, decided: false });
    }
    Ok(out)
}

/// Re-diff the file now; the hash of the *current* worktree must still equal the hash the reviewer saw.
pub fn current_hash(root: &Path, r: &FileReview) -> Result<String> {
    let _ = gitops::git(root, &["add", "-N", "--", &r.file], None);
    let d = diff_for(root, &r.file);
    let _ = gitops::git(root, &["reset", "-q", "--", &r.file], None);
    let (_, hunks) = parse_file_diff(&d?);
    Ok(content_hash(&r.file, &hunks))
}

#[derive(Debug, PartialEq)]
pub enum Verdict {
    Ok,
    Blocked(String),
}

/// Decide whether a review_decision may be applied. Mismatch of any kind => not approvable.
pub fn verify(root: &Path, r: &FileReview, sent_hash: &str, accepted: &[String], rejected: &[String]) -> Verdict {
    if r.decided {
        return Verdict::Blocked("review already decided".into());
    }
    if sent_hash != r.content_hash {
        return Verdict::Blocked("content hash mismatch: the decision does not match the proposed diff; not approvable".into());
    }
    match current_hash(root, r) {
        Ok(h) if h == r.content_hash => {}
        Ok(_) => return Verdict::Blocked("file changed since the diff was proposed; not approvable".into()),
        Err(e) => return Verdict::Blocked(format!("cannot re-check file: {}", e.message)),
    }
    let mut seen: Vec<&str> = accepted.iter().chain(rejected.iter()).map(|s| s.as_str()).collect();
    seen.sort();
    let before = seen.len();
    seen.dedup();
    if before != seen.len() {
        return Verdict::Blocked("hunk listed twice".into());
    }
    let mut known: Vec<&str> = r.hunks.iter().map(|h| h.id.as_str()).collect();
    known.sort();
    if seen != known {
        return Verdict::Blocked("decision must name every proposed hunk exactly once".into());
    }
    Verdict::Ok
}

/// Revert the rejected hunks in the worktree (reverse apply). Accepted hunks stay as uncommitted work.
pub fn apply_rejections(root: &Path, r: &FileReview, rejected: &[String]) -> Result<()> {
    if rejected.is_empty() {
        return Ok(());
    }
    let mut patch = r.preamble.clone();
    for h in r.hunks.iter().filter(|h| rejected.contains(&h.id)) {
        patch.push_str(&h.raw);
    }
    if !patch.ends_with('\n') {
        patch.push('\n');
    }
    gitops::git(root, &["apply", "-R", "--whitespace=nowarn", "-"], Some(&patch)).map_err(|e| CliError::new(ErrorKind::Internal, format!("could not revert rejected hunks: {}", e.message)))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hk(id: &str, lines: &[&str]) -> Hunk {
        Hunk { id: id.into(), header: "@@".into(), lines: lines.iter().map(|s| s.to_string()).collect(), raw: String::new() }
    }

    #[test]
    fn hash_matches_s12_formula_literally() {
        let hunks = vec![hk("h1", &["-a", "+b"]), hk("h2", &[" c"])];
        let mut h = Sha256::new();
        h.update(b"f.txt\0h1\0-a\n+b\0h2\0 c\0");
        let want: String = h.finalize().iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(content_hash("f.txt", &hunks), want);
        assert_ne!(content_hash("f.txt", &hunks[..1]), want);
        assert_ne!(content_hash("g.txt", &hunks), want);
    }

    #[test]
    fn parses_hunks_and_drops_no_newline_marker() {
        let d = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n\\ No newline at end of file\n@@ -9 +9 @@\n-z\n+y\n";
        let (pre, hs) = parse_file_diff(d);
        assert!(pre.starts_with("diff --git") && !pre.contains("@@"));
        assert_eq!(hs.len(), 2);
        assert_eq!(hs[0].lines, [" a", "-b", "+c"]);
        assert_eq!(hs[1].id, "h2");
        assert!(hs[0].raw.contains("No newline"));
    }
}
