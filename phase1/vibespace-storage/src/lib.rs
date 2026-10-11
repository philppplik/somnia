//! Vibe Space persistence: spaces, studios, runs, sequenced event log, checkpoint
//! references and scoped memory, on SQLite (bundled, FTS5).
//!
//! UNVERIFIED DRAFT: this crate was written without a Rust toolchain and has not
//! been compiled or tested by its author. See docs/vibespace/storage.md.
//!
//! The raw `rusqlite::Connection` is never exposed. All inputs/outputs are
//! serializable DTOs (camelCase fields, snake_case enum values, `schemaVersion`).

pub mod error;
pub mod model;
pub mod redact;
pub mod schema;
pub mod store;
pub mod time;

mod memory;
mod runs;

pub use error::{Error, ErrorDto, Result};
pub use model::*;
pub use schema::{Migration, MIGRATIONS, SCHEMA_VERSION};
pub use store::{Clock, Recovery, Store, StoreOptions};

/// Version of the serialized DTO shapes in this crate.
pub const DTO_SCHEMA_VERSION: u32 = 1;
/// Version of the run event envelope (matches the wire contract `protocolVersion`).
pub const PROTOCOL_VERSION: u32 = 1;

/// Hard limits enforced by the store. Mirrored in `Capabilities.limits`.
pub mod limits {
    pub const MAX_NAME_CHARS: usize = 200;
    pub const MAX_GOAL_CHARS: usize = 20_000;
    pub const MAX_MEMORY_CONTENT_BYTES: usize = 16 * 1024;
    pub const MAX_MEMORY_PER_SPACE: i64 = 10_000;
    pub const MAX_EVENT_PAYLOAD_BYTES: usize = 16 * 1024;
    pub const MAX_EVENTS_PER_RUN: i64 = 10_000;
    /// Extra sequence numbers reserved for state-change/interruption events.
    pub const EVENT_RESERVE: i64 = 64;
    pub const MAX_QUERY_CHARS: usize = 512;
    pub const MAX_LIST_LIMIT: usize = 500;
    pub const DEFAULT_LIST_LIMIT: usize = 50;
    pub const MAX_LEASE_TTL_MS: i64 = 3_600_000;
}
