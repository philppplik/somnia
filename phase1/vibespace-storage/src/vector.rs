//! Opt-in vector memory search, per space.
//!
//! Contract (package A6, decision A8):
//! * FTS5 stays the default and the fallback. Nothing here changes `search_memory`.
//! * Nothing is created before an explicit opt-in: the `memory_embeddings` table, its delete
//!   trigger and every vector row exist only after `vector_enable` for that space.
//! * This crate never downloads a model and never calls a network. Embedding is behind the
//!   [`Embedder`] trait; the real multilingual-e5-small backend lives in `vibespace-embed`.
//! * Vectors are stored as f32 BLOBs; ranking uses sqlite-vec's `vec_distance_cosine` (brute force,
//!   fine for the 10k items-per-space limit). Deleting a memory item or a space removes its vectors.

use crate::error::{Error, Result};
use crate::model::*;
use crate::store::{check_text, clamp_limit, ensure_space, Store};
use crate::DTO_SCHEMA_VERSION;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EmbedKind {
    Query,
    Passage,
}

/// Text embedding backend. Implementations must be local (no per-call network).
pub trait Embedder: Send + Sync {
    fn model_id(&self) -> &str;
    fn dims(&self) -> usize;
    fn embed(&self, texts: &[String], kind: EmbedKind) -> Result<Vec<Vec<f32>>>;
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VectorOptIn {
    pub space_id: String,
    pub model_id: String,
    pub dims: usize,
    /// Must be `true`: the user saw what gets stored locally and agreed.
    pub acknowledged: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VectorStatus {
    pub schema_version: u32,
    pub space_id: String,
    pub compiled_in: bool,
    pub enabled: bool,
    pub model_id: Option<String>,
    pub dims: Option<usize>,
    pub consented_at: Option<String>,
    pub indexed: i64,
    pub total: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HybridMode {
    /// FTS5 and vectors merged (reciprocal rank fusion).
    Hybrid,
    /// Vector search was not used; result is the unchanged FTS5 search.
    Fts5,
    LikeFallback,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HybridHit {
    pub item: MemoryItem,
    pub score: f64,
    pub from_fts: bool,
    pub from_vector: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HybridResponse {
    pub schema_version: u32,
    pub mode: HybridMode,
    /// Why vectors were not used (not opted in, model mismatch, embed error, ...).
    pub vector_fallback_reason: Option<String>,
    pub hits: Vec<HybridHit>,
}

#[cfg(feature = "vector")]
fn register() {
    use std::sync::Once;
    static ONCE: Once = Once::new();
    ONCE.call_once(|| unsafe {
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute::<
            *const (),
            unsafe extern "C" fn(
                *mut rusqlite::ffi::sqlite3,
                *mut *mut std::os::raw::c_char,
                *const rusqlite::ffi::sqlite3_api_routines,
            ) -> std::os::raw::c_int,
        >(sqlite_vec::sqlite3_vec_init as *const ())));
    });
}

/// Must run before the connection is opened (auto-extension only affects new connections).
pub(crate) fn prepare_process() {
    #[cfg(feature = "vector")]
    register();
}

pub fn compiled_in() -> bool {
    cfg!(feature = "vector")
}

fn vec_available(c: &Connection) -> bool {
    c.query_row("SELECT vec_version()", [], |r| r.get::<_, String>(0)).is_ok()
}

fn table_exists(c: &Connection, name: &str) -> Result<bool> {
    Ok(c.query_row(
        "SELECT count(*) FROM sqlite_master WHERE name=?1",
        params![name],
        |r| r.get::<_, i64>(0),
    )? > 0)
}

fn to_blob(v: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 4);
    for f in v {
        out.extend_from_slice(&f.to_le_bytes());
    }
    out
}

struct Settings {
    model_id: String,
    dims: usize,
    consented_at: String,
}

fn settings(c: &Connection, space_id: &str) -> Result<Option<Settings>> {
    use rusqlite::OptionalExtension;
    Ok(c.query_row(
        "SELECT model_id, dims, consented_at FROM memory_vector_settings WHERE space_id=?1",
        params![space_id],
        |r| {
            Ok(Settings {
                model_id: r.get(0)?,
                dims: r.get::<_, i64>(1)? as usize,
                consented_at: r.get(2)?,
            })
        },
    )
    .optional()?)
}

impl Store {
    pub fn vector_status(&self, space_id: &str) -> Result<VectorStatus> {
        self.read(|c| {
            ensure_space(c, space_id)?;
            let s = settings(c, space_id)?;
            let total: i64 = c.query_row(
                "SELECT count(*) FROM memory_items WHERE space_id=?1",
                params![space_id],
                |r| r.get(0),
            )?;
            let indexed: i64 = if s.is_some() && table_exists(c, "memory_embeddings")? {
                c.query_row(
                    "SELECT count(*) FROM memory_embeddings WHERE space_id=?1",
                    params![space_id],
                    |r| r.get(0),
                )?
            } else {
                0
            };
            Ok(VectorStatus {
                schema_version: DTO_SCHEMA_VERSION,
                space_id: space_id.to_string(),
                compiled_in: compiled_in(),
                enabled: s.is_some(),
                model_id: s.as_ref().map(|s| s.model_id.clone()),
                dims: s.as_ref().map(|s| s.dims),
                consented_at: s.map(|s| s.consented_at),
                indexed,
                total,
            })
        })
    }

    /// Explicit per-space opt-in. Creates the embeddings table on first use. No download happens here.
    pub fn vector_enable(&self, req: VectorOptIn) -> Result<VectorStatus> {
        if !req.acknowledged {
            return Err(Error::InvalidInput(
                "vector search needs explicit consent (acknowledged=true)".into(),
            ));
        }
        if !compiled_in() {
            return Err(Error::Unsupported("vector search is not compiled into this build".into()));
        }
        let model = check_text("modelId", &req.model_id, 200, false)?;
        if req.dims == 0 || req.dims > 4096 {
            return Err(Error::InvalidInput("dims must be 1..=4096".into()));
        }
        let now = self.now_str();
        self.write(|tx| {
            ensure_space(tx, &req.space_id)?;
            if !vec_available(tx) {
                return Err(Error::Unsupported("sqlite-vec failed to load".into()));
            }
            tx.execute_batch(
                "CREATE TABLE IF NOT EXISTS memory_embeddings (
                    memory_seq INTEGER PRIMARY KEY NOT NULL REFERENCES memory_items(seq) ON DELETE CASCADE,
                    space_id   TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
                    model_id   TEXT NOT NULL,
                    vector     BLOB NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS idx_memory_emb_space ON memory_embeddings(space_id);",
            )?;
            if let Some(old) = settings(tx, &req.space_id)? {
                if old.model_id != model || old.dims != req.dims {
                    // A different model makes old vectors meaningless: drop them, re-index later.
                    tx.execute("DELETE FROM memory_embeddings WHERE space_id=?1", params![req.space_id])?;
                }
            }
            tx.execute(
                "INSERT INTO memory_vector_settings (space_id, model_id, dims, consented_at) VALUES (?1,?2,?3,?4)
                 ON CONFLICT(space_id) DO UPDATE SET model_id=excluded.model_id, dims=excluded.dims, consented_at=excluded.consented_at",
                params![req.space_id, model, req.dims as i64, now],
            )?;
            Ok(())
        })?;
        self.vector_status(&req.space_id)
    }

    /// Opt out: the space's vectors and settings are deleted. Memory items and FTS are untouched.
    pub fn vector_disable(&self, space_id: &str) -> Result<VectorStatus> {
        self.write(|tx| {
            ensure_space(tx, space_id)?;
            if table_exists(tx, "memory_embeddings")? {
                tx.execute("DELETE FROM memory_embeddings WHERE space_id=?1", params![space_id])?;
            }
            tx.execute("DELETE FROM memory_vector_settings WHERE space_id=?1", params![space_id])?;
            Ok(())
        })?;
        self.vector_status(space_id)
    }

    /// Embeds up to `batch` not-yet-indexed items of an opted-in space. Returns how many were indexed.
    pub fn vector_index_pending(&self, space_id: &str, embedder: &dyn Embedder, batch: usize) -> Result<usize> {
        let batch = batch.clamp(1, 256);
        let (seqs, texts) = self.read(|c| {
            ensure_space(c, space_id)?;
            let s = settings(c, space_id)?
                .ok_or_else(|| Error::Conflict("vector search is not enabled for this space".into()))?;
            if s.model_id != embedder.model_id() || s.dims != embedder.dims() {
                return Err(Error::Conflict("embedder does not match the model the user opted into".into()));
            }
            let mut st = c.prepare(
                "SELECT m.seq, COALESCE(m.title,'') || CASE WHEN m.title IS NULL THEN '' ELSE '. ' END || m.content
                 FROM memory_items m LEFT JOIN memory_embeddings e ON e.memory_seq = m.seq
                 WHERE m.space_id=?1 AND e.memory_seq IS NULL ORDER BY m.seq LIMIT ?2",
            )?;
            let rows = st.query_map(params![space_id, batch as i64], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
            let mut a = Vec::new();
            let mut b = Vec::new();
            for r in rows {
                let (s, t) = r?;
                a.push(s);
                b.push(t);
            }
            Ok((a, b))
        })?;
        if seqs.is_empty() {
            return Ok(0);
        }
        let vecs = embedder.embed(&texts, EmbedKind::Passage)?;
        if vecs.len() != seqs.len() || vecs.iter().any(|v| v.len() != embedder.dims()) {
            return Err(Error::InvalidInput("embedder returned a wrong number or size of vectors".into()));
        }
        let model = embedder.model_id().to_string();
        self.write(|tx| {
            // Re-check opt-in inside the write: opt-out may have happened while embedding.
            if settings(tx, space_id)?.map(|s| s.model_id) != Some(model.clone()) {
                return Ok(0);
            }
            let mut n = 0;
            for (seq, v) in seqs.iter().zip(vecs.iter()) {
                n += tx.execute(
                    "INSERT OR REPLACE INTO memory_embeddings (memory_seq, space_id, model_id, vector)
                     SELECT seq, space_id, ?2, ?3 FROM memory_items WHERE seq=?1 AND space_id=?4",
                    params![seq, model, to_blob(v), space_id],
                )?;
            }
            Ok(n)
        })
    }

    /// Hybrid search. Without opt-in (or on any vector problem) this is exactly `search_memory`.
    pub fn search_memory_hybrid(
        &self,
        space_id: &str,
        query: &str,
        opts: &SearchOptions,
        embedder: Option<&dyn Embedder>,
    ) -> Result<HybridResponse> {
        let fts = self.search_memory(space_id, query, opts)?;
        let fts_mode = match fts.mode {
            SearchMode::Fts5 => HybridMode::Fts5,
            SearchMode::LikeFallback => HybridMode::LikeFallback,
        };
        let plain = |reason: Option<String>, fts: SearchResponse| HybridResponse {
            schema_version: DTO_SCHEMA_VERSION,
            mode: fts_mode,
            vector_fallback_reason: reason,
            hits: fts
                .hits
                .into_iter()
                .map(|h| HybridHit { score: h.score.unwrap_or(0.0), item: h.item, from_fts: true, from_vector: false })
                .collect(),
        };
        let status = self.vector_status(space_id)?;
        if !status.enabled {
            return Ok(plain(Some("vector_not_opted_in".into()), fts));
        }
        let Some(emb) = embedder else {
            return Ok(plain(Some("embedder_unavailable".into()), fts));
        };
        if Some(emb.model_id()) != status.model_id.as_deref() || Some(emb.dims()) != status.dims {
            return Ok(plain(Some("embedder_model_mismatch".into()), fts));
        }
        if status.indexed == 0 {
            return Ok(plain(Some("vector_index_empty".into()), fts));
        }
        let q = check_text("query", query, crate::limits::MAX_QUERY_CHARS, false)?;
        let qv = match emb.embed(&[q], EmbedKind::Query) {
            Ok(mut v) if v.len() == 1 && v[0].len() == emb.dims() => v.remove(0),
            Ok(_) => return Ok(plain(Some("embedder_bad_output".into()), fts)),
            Err(e) => return Ok(plain(Some(format!("embed_error: {e}")), fts)),
        };
        let lim = clamp_limit(opts.limit)?;
        let vec_hits = self.read(|c| {
            let mut st = c.prepare(
                "SELECT m.id, vec_distance_cosine(e.vector, ?2) AS d FROM memory_embeddings e
                 JOIN memory_items m ON m.seq = e.memory_seq
                 WHERE e.space_id=?1 AND e.model_id=?3 AND (?4 OR m.consent != 'pending_review')
                 ORDER BY d, m.seq LIMIT ?5",
            )?;
            let rows = st.query_map(
                params![space_id, to_blob(&qv), status.model_id, opts.include_pending, lim],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?)),
            )?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r?);
            }
            Ok(out)
        })?;
        // Reciprocal rank fusion, k=60.
        let mut score: HashMap<String, f64> = HashMap::new();
        let mut items: HashMap<String, MemoryItem> = HashMap::new();
        let mut from_fts: HashMap<String, bool> = HashMap::new();
        let mut from_vec: HashMap<String, bool> = HashMap::new();
        for (i, h) in fts.hits.into_iter().enumerate() {
            *score.entry(h.item.id.clone()).or_default() += 1.0 / (60.0 + i as f64 + 1.0);
            from_fts.insert(h.item.id.clone(), true);
            items.insert(h.item.id.clone(), h.item);
        }
        for (i, (id, _d)) in vec_hits.iter().enumerate() {
            *score.entry(id.clone()).or_default() += 1.0 / (60.0 + i as f64 + 1.0);
            from_vec.insert(id.clone(), true);
            if !items.contains_key(id) {
                if let Some(it) = self.get_memory(space_id, id)? {
                    items.insert(id.clone(), it);
                }
            }
        }
        let mut hits: Vec<HybridHit> = items
            .into_iter()
            .map(|(id, item)| HybridHit {
                score: score[&id],
                from_fts: *from_fts.get(&id).unwrap_or(&false),
                from_vector: *from_vec.get(&id).unwrap_or(&false),
                item,
            })
            .collect();
        hits.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap().then_with(|| a.item.id.cmp(&b.item.id)));
        hits.truncate(lim as usize);
        Ok(HybridResponse { schema_version: DTO_SCHEMA_VERSION, mode: HybridMode::Hybrid, vector_fallback_reason: None, hits })
    }

    /// Deletes every memory item of one space (and via cascade its vectors). Returns the count.
    pub fn delete_all_memory(&self, space_id: &str) -> Result<usize> {
        self.write(|tx| {
            ensure_space(tx, space_id)?;
            Ok(tx.execute("DELETE FROM memory_items WHERE space_id=?1", params![space_id])?)
        })
    }

    /// Consent review for an agent-proposed item: approve keeps it, reject deletes it.
    pub fn review_memory(&self, space_id: &str, id: &str, approve: bool) -> Result<bool> {
        self.write(|tx| {
            ensure_space(tx, space_id)?;
            let n = if approve {
                tx.execute(
                    "UPDATE memory_items SET consent='user_approved' WHERE id=?1 AND space_id=?2 AND consent='pending_review'",
                    params![id, space_id],
                )?
            } else {
                tx.execute(
                    "DELETE FROM memory_items WHERE id=?1 AND space_id=?2 AND consent='pending_review'",
                    params![id, space_id],
                )?
            };
            Ok(n > 0)
        })
    }
}
