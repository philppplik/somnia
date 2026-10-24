//! Vibe Space integration contracts. The core owns orchestration; the renderer
//! receives data and sends explicit commands. This crate does not yet run agents.
pub mod wire;

pub mod folder_grants;

pub mod effect_port;

pub mod runtime;

/// Native-only persistence API. Never expose Store or Connection as renderer authority.
pub use somnia_vibespace_storage as storage;
/// Native bridge configuration types. SDK implementation types stay private in
/// the engine crate; no direct SDK dependency is needed by the Desktop bridge.
pub use vibespace_engine as engine;

pub mod ownership;
