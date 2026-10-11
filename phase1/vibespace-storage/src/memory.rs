//! Scoped memory: every operation takes an explicit `space_id`; there is no global memory.
//! Content is stored and returned as untrusted data with provenance kept in separate fields.

use crate::error::{Error, Result};
use crate::model::*;
use crate::redact::text_contains_secret;
use crate::store::{check_text, clamp_limit, ensure_space, enum_col, new_id, Store};
use crate::{limits, DTO_SCHEMA_VERSION};
use rusqlite::{params, Connection, OptionalExtension, Row};

const MEM_COLS: &str =
    "m.id, m.space_id, m.kind, m.title, m.content, m.source, m.source_ref, m.consent, m.created_at";

fn mem_from_row(r: &Row<'_>) -> rusqlite::Result<MemoryItem> {
    Ok(MemoryItem {
        schema_version: DTO_SCHEMA_VERSION,
        id: r.get(0)?,
        space_id: r.get(1)?,
        kind: enum_col(r, 2, MemoryKind::parse)?,
        title: r.get(3)?,
        content: r.get(4)?,
        provenance: Provenance {
            source: enum_col(r, 5, MemorySource::parse)?,
            source_ref: r.get(6)?,
            consent: enum_col(r, 7, MemoryConsent::parse)?,
        },
        instruction_authority: "none".to_string(),
        created_at: r.get(8)?,
    })
}

/// Turns free text into a safe FTS5 expression: alphanumeric tokens only, each quoted
/// (so `AND`, `NEAR`, `*`, `"`, `:` etc. lose their operator meaning); the last token is a prefix match.
fn fts_expression(q: &str) -> Option<String> {
    let toks: Vec<&str> = q
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .take(16)
        .collect();
    if toks.is_empty() {
        return None;
    }
    let n = toks.len();
    let parts: Vec<String> = toks
        .iter()
        .enumerate()
        .map(|(i, t)| {
            if i + 1 == n {
                format!("\"{t}\"*")
            } else {
                format!("\"{t}\"")
            }
        })
        .collect();
    Some(parts.join(" "))
}

fn like_pattern(q: &str) -> String {
    let mut s = String::from("%");
    for c in q.chars() {
        if matches!(c, '\\' | '%' | '_') {
            s.push('\\');
        }
        s.push(c);
    }
    s.push('%');
    s
}

impl Store {
    pub fn add_memory(&self, req: NewMemory) -> Result<MemoryItem> {
        check_version(req.schema_version)?;
        let content = check_text(
            "content",
            &req.content,
            limits::MAX_MEMORY_CONTENT_BYTES,
            false,
        )?;
        if content.len() > limits::MAX_MEMORY_CONTENT_BYTES {
            return Err(Error::InvalidInput(format!(
                "content exceeds {} bytes",
                limits::MAX_MEMORY_CONTENT_BYTES
            )));
        }
        if text_contains_secret(&content) {
            return Err(Error::InvalidInput(
                "content looks like a credential; secrets must not be stored as memory".into(),
            ));
        }
        let title = match &req.title {
            Some(t) => {
                let t = check_text("title", t, limits::MAX_NAME_CHARS, true)?;
                if t.is_empty() {
                    None
                } else {
                    Some(t)
                }
            }
            None => None,
        };
        let source_ref = match &req.source_ref {
            Some(s) => Some(check_text("sourceRef", s, 500, false)?),
            None => None,
        };
        let id = new_id();
        let now = self.now_str();
        self.write(|tx| {
            ensure_space(tx, &req.space_id)?;
            let count: i64 = tx.query_row("SELECT count(*) FROM memory_items WHERE space_id=?1", params![req.space_id], |r| r.get(0))?;
            if count >= limits::MAX_MEMORY_PER_SPACE {
                return Err(Error::LimitExceeded(format!("space has {} memory items", limits::MAX_MEMORY_PER_SPACE)));
            }
            tx.execute(
                "INSERT INTO memory_items (id, space_id, kind, title, content, source, source_ref, consent, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![id, req.space_id, req.kind.as_str(), title, content, req.source.as_str(), source_ref, req.consent.as_str(), now],
            )?;
            Ok(())
        })?;
        self.read(|c| get_memory_conn(c, &req.space_id, &id))?
            .ok_or_else(|| Error::NotFound {
                entity: "memory",
                id,
            })
    }

    /// `Ok(None)` when the id does not exist in THAT space (other spaces are invisible).
    pub fn get_memory(&self, space_id: &str, id: &str) -> Result<Option<MemoryItem>> {
        self.read(|c| get_memory_conn(c, space_id, id))
    }

    pub fn list_memory(&self, space_id: &str, opts: &MemoryListOptions) -> Result<Vec<MemoryItem>> {
        let lim = clamp_limit(opts.limit)?;
        let off = opts.offset as i64;
        self.read(|c| {
            ensure_space(c, space_id)?;
            let mut st = c.prepare(&format!(
                "SELECT {MEM_COLS} FROM memory_items m WHERE m.space_id=?1 AND (?2 OR m.consent != 'pending_review') \
                 ORDER BY m.created_at DESC, m.seq DESC LIMIT ?3 OFFSET ?4"
            ))?;
            let rows = st.query_map(params![space_id, opts.include_pending, lim, off], mem_from_row)?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r?);
            }
            Ok(out)
        })
    }

    /// Deletes one item from the given space (and, via trigger, from the FTS index).
    /// Returns false when the id is not in that space.
    pub fn delete_memory(&self, space_id: &str, id: &str) -> Result<bool> {
        self.write(|tx| {
            ensure_space(tx, space_id)?;
            let n = tx.execute(
                "DELETE FROM memory_items WHERE id=?1 AND space_id=?2",
                params![id, space_id],
            )?;
            Ok(n > 0)
        })
    }

    /// Ranked FTS5 search inside one space. If FTS5 is unavailable/disabled, errors, or the
    /// query has no searchable tokens, falls back to a literal substring search and says so
    /// in `mode` and `fallback_reason`. Never silently degrades.
    pub fn search_memory(
        &self,
        space_id: &str,
        query: &str,
        opts: &SearchOptions,
    ) -> Result<SearchResponse> {
        let q = check_text("query", query, limits::MAX_QUERY_CHARS, false)?;
        let lim = clamp_limit(opts.limit)?;
        self.read(|c| {
            ensure_space(c, space_id)?;
            let reason: String;
            if !self.fts_enabled {
                reason = "fts5_unavailable_or_disabled".to_string();
            } else if let Some(expr) = fts_expression(&q) {
                match fts_search(c, space_id, &expr, opts.include_pending, lim) {
                    Ok(hits) => {
                        return Ok(SearchResponse {
                            schema_version: DTO_SCHEMA_VERSION,
                            mode: SearchMode::Fts5,
                            fallback_reason: None,
                            hits,
                        });
                    }
                    Err(e) => reason = format!("fts5_error: {e}"),
                }
            } else {
                reason = "no_searchable_tokens".to_string();
            }
            let hits = like_search(c, space_id, &q, opts.include_pending, lim)?;
            Ok(SearchResponse {
                schema_version: DTO_SCHEMA_VERSION,
                mode: SearchMode::LikeFallback,
                fallback_reason: Some(reason),
                hits,
            })
        })
    }
}

fn get_memory_conn(c: &Connection, space_id: &str, id: &str) -> Result<Option<MemoryItem>> {
    Ok(c.query_row(
        &format!("SELECT {MEM_COLS} FROM memory_items m WHERE m.id=?1 AND m.space_id=?2"),
        params![id, space_id],
        mem_from_row,
    )
    .optional()?)
}

fn fts_search(
    c: &Connection,
    space_id: &str,
    expr: &str,
    include_pending: bool,
    lim: i64,
) -> rusqlite::Result<Vec<SearchHit>> {
    // bm25 is lower-is-better (negative); expose score = -bm25 so higher is better.
    let mut st = c.prepare(&format!(
        "SELECT {MEM_COLS}, bm25(memory_fts, 5.0, 1.0) AS rank FROM memory_fts \
         JOIN memory_items m ON m.seq = memory_fts.rowid \
         WHERE memory_fts MATCH ?1 AND m.space_id = ?2 AND (?3 OR m.consent != 'pending_review') \
         ORDER BY rank, m.seq LIMIT ?4"
    ))?;
    let rows = st.query_map(params![expr, space_id, include_pending, lim], |r| {
        let item = mem_from_row(r)?;
        let rank: f64 = r.get(9)?;
        Ok(SearchHit {
            item,
            score: Some(-rank),
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn like_search(
    c: &Connection,
    space_id: &str,
    q: &str,
    include_pending: bool,
    lim: i64,
) -> Result<Vec<SearchHit>> {
    let pat = like_pattern(q);
    let mut st = c.prepare(&format!(
        "SELECT {MEM_COLS} FROM memory_items m WHERE m.space_id=?1 AND (?2 OR m.consent != 'pending_review') \
         AND (m.content LIKE ?3 ESCAPE '\\' OR COALESCE(m.title,'') LIKE ?3 ESCAPE '\\') \
         ORDER BY m.created_at DESC, m.seq DESC LIMIT ?4"
    ))?;
    let rows = st.query_map(params![space_id, include_pending, pat, lim], |r| {
        Ok(SearchHit {
            item: mem_from_row(r)?,
            score: None,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fts_expression_neutralizes_operators() {
        assert_eq!(
            fts_expression("foo AND bar*").unwrap(),
            "\"foo\" \"AND\" \"bar\"*"
        );
        assert_eq!(
            fts_expression("\"; DROP TABLE x;--").unwrap(),
            "\"DROP\" \"TABLE\" \"x\"*"
        );
        assert!(fts_expression("%%  --").is_none());
    }
    #[test]
    fn like_pattern_escapes_wildcards() {
        assert_eq!(like_pattern("50%_\\"), "%50\\%\\_\\\\%");
    }
}
