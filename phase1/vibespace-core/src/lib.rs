//! Vibe Space integration contracts. The core owns orchestration; the renderer
//! receives data and sends explicit commands. This crate does not yet run agents.
pub mod wire;

pub mod folder_grants;

pub mod effect_port;

pub mod runtime;
