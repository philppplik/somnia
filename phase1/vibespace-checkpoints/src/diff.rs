//! Change sets and review (text diff for UTF-8 files, metadata for everything else).

use crate::digest::{CheckpointId, Digest};
use crate::manifest::{Entry, Skipped};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    /// Same content, different executable bit.
    ModeChanged,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Change {
    /// Snapshot key `"<root>/<relative path>"`.
    pub path: String,
    pub kind: ChangeKind,
    pub before: Option<Entry>,
    pub after: Option<Entry>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChangeSet {
    pub baseline: CheckpointId,
    pub changes: Vec<Change>,
    /// Things in the isolated copy that are never applied (`.git`, excluded paths, skipped symlinks).
    pub skipped: Vec<Skipped>,
}

pub(crate) fn diff_manifests(
    base: &BTreeMap<String, Entry>,
    now: &BTreeMap<String, Entry>,
) -> Vec<Change> {
    let mut out = Vec::new();
    for (k, b) in base {
        match now.get(k) {
            None => out.push(Change {
                path: k.clone(),
                kind: ChangeKind::Deleted,
                before: Some(b.clone()),
                after: None,
            }),
            Some(n) if n.digest != b.digest => out.push(Change {
                path: k.clone(),
                kind: ChangeKind::Modified,
                before: Some(b.clone()),
                after: Some(n.clone()),
            }),
            Some(n) if n.exec != b.exec => out.push(Change {
                path: k.clone(),
                kind: ChangeKind::ModeChanged,
                before: Some(b.clone()),
                after: Some(n.clone()),
            }),
            Some(_) => {}
        }
    }
    for (k, n) in now {
        if !base.contains_key(k) {
            out.push(Change {
                path: k.clone(),
                kind: ChangeKind::Added,
                before: None,
                after: Some(n.clone()),
            });
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ContentDiff {
    /// Unified diff of UTF-8 text.
    Text {
        unified: String,
        added_lines: usize,
        removed_lines: usize,
    },
    /// Not shown as text: binary, not UTF-8, or too large. Metadata only.
    Binary {
        before_size: Option<u64>,
        after_size: Option<u64>,
        before_digest: Option<Digest>,
        after_digest: Option<Digest>,
        note: String,
    },
    /// Only the executable bit changed.
    ModeOnly { before_exec: bool, after_exec: bool },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReviewedChange {
    pub change: Change,
    pub content: ContentDiff,
}

/// What a human (or UI) reviews before `explicit_apply`. Apply only accepts paths that are in here,
/// and only if the isolated file still has exactly the reviewed digest.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Review {
    pub baseline: CheckpointId,
    pub isolated_id: String,
    pub changes: Vec<ReviewedChange>,
    pub skipped: Vec<Skipped>,
}

/// Largest file (per side) that gets a text diff.
pub const MAX_TEXT_DIFF_BYTES: usize = 1 << 20;
const MAX_LCS_CELLS: usize = 4_000_000;
const CONTEXT: usize = 3;

pub(crate) fn as_text(bytes: &[u8]) -> Option<&str> {
    if bytes.len() > MAX_TEXT_DIFF_BYTES || bytes.contains(&0) {
        return None;
    }
    std::str::from_utf8(bytes).ok()
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Op {
    Eq,
    Del,
    Ins,
}

/// Line-based unified diff. Returns (text, added, removed).
pub fn unified_diff(
    old: &str,
    new: &str,
    old_label: &str,
    new_label: &str,
) -> (String, usize, usize) {
    let a: Vec<&str> = old.split_inclusive('\n').collect();
    let b: Vec<&str> = new.split_inclusive('\n').collect();
    let mut pre = 0;
    while pre < a.len() && pre < b.len() && a[pre] == b[pre] {
        pre += 1;
    }
    let mut suf = 0;
    while suf < a.len() - pre && suf < b.len() - pre && a[a.len() - 1 - suf] == b[b.len() - 1 - suf]
    {
        suf += 1;
    }
    let am = &a[pre..a.len() - suf];
    let bm = &b[pre..b.len() - suf];
    let mut ops: Vec<(Op, &str)> = a[..pre].iter().map(|l| (Op::Eq, *l)).collect();
    if am.len().saturating_mul(bm.len()) > MAX_LCS_CELLS {
        ops.extend(am.iter().map(|l| (Op::Del, *l)));
        ops.extend(bm.iter().map(|l| (Op::Ins, *l)));
    } else {
        let (n, m) = (am.len(), bm.len());
        let w = m + 1;
        let mut t = vec![0u32; (n + 1) * w];
        for i in (0..n).rev() {
            for j in (0..m).rev() {
                t[i * w + j] = if am[i] == bm[j] {
                    t[(i + 1) * w + j + 1] + 1
                } else {
                    t[(i + 1) * w + j].max(t[i * w + j + 1])
                };
            }
        }
        let (mut i, mut j) = (0, 0);
        while i < n && j < m {
            if am[i] == bm[j] {
                ops.push((Op::Eq, am[i]));
                i += 1;
                j += 1;
            } else if t[(i + 1) * w + j] >= t[i * w + j + 1] {
                ops.push((Op::Del, am[i]));
                i += 1;
            } else {
                ops.push((Op::Ins, bm[j]));
                j += 1;
            }
        }
        ops.extend(am[i..].iter().map(|l| (Op::Del, *l)));
        ops.extend(bm[j..].iter().map(|l| (Op::Ins, *l)));
    }
    ops.extend(a[a.len() - suf..].iter().map(|l| (Op::Eq, *l)));

    let added = ops.iter().filter(|o| o.0 == Op::Ins).count();
    let removed = ops.iter().filter(|o| o.0 == Op::Del).count();
    let mut out = String::new();
    if added + removed == 0 {
        return (out, 0, 0);
    }
    out.push_str(&format!("--- {old_label}\n+++ {new_label}\n"));
    // hunks
    let change_idx: Vec<usize> = ops
        .iter()
        .enumerate()
        .filter(|(_, o)| o.0 != Op::Eq)
        .map(|(i, _)| i)
        .collect();
    let mut ranges: Vec<(usize, usize)> = Vec::new();
    for &i in &change_idx {
        let s = i.saturating_sub(CONTEXT);
        let e = (i + CONTEXT + 1).min(ops.len());
        match ranges.last_mut() {
            Some(last) if s <= last.1 => last.1 = e,
            _ => ranges.push((s, e)),
        }
    }
    // line counters before each op index
    let mut old_pos = vec![0usize; ops.len() + 1];
    let mut new_pos = vec![0usize; ops.len() + 1];
    for (i, o) in ops.iter().enumerate() {
        old_pos[i + 1] = old_pos[i] + (o.0 != Op::Ins) as usize;
        new_pos[i + 1] = new_pos[i] + (o.0 != Op::Del) as usize;
    }
    for (s, e) in ranges {
        let oc = old_pos[e] - old_pos[s];
        let nc = new_pos[e] - new_pos[s];
        let os = if oc == 0 { old_pos[s] } else { old_pos[s] + 1 };
        let ns = if nc == 0 { new_pos[s] } else { new_pos[s] + 1 };
        out.push_str(&format!("@@ -{os},{oc} +{ns},{nc} @@\n"));
        for (op, line) in &ops[s..e] {
            out.push(match op {
                Op::Eq => ' ',
                Op::Del => '-',
                Op::Ins => '+',
            });
            out.push_str(line);
            if !line.ends_with('\n') {
                out.push_str("\n\\ No newline at end of file\n");
            }
        }
    }
    (out, added, removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_diff() {
        let (d, a, r) = unified_diff("a\nb\nc\n", "a\nB\nc\nd\n", "x", "y");
        assert_eq!((a, r), (2, 1));
        assert!(d.contains("-b\n") && d.contains("+B\n") && d.contains("+d\n"));
        assert!(d.starts_with("--- x\n+++ y\n@@ -1,3 +1,4 @@\n"), "{d}");
    }

    #[test]
    fn no_trailing_newline_and_empty() {
        let (d, _, _) = unified_diff("a", "b", "x", "y");
        assert!(d.contains("\\ No newline at end of file"));
        let (d, a, r) = unified_diff("", "hi\n", "x", "y");
        assert_eq!((a, r), (1, 0));
        assert!(d.contains("@@ -0,0 +1,1 @@"));
        assert_eq!(unified_diff("same\n", "same\n", "x", "y").0, "");
    }
}
