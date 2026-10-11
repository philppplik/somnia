#![cfg_attr(windows, windows_subsystem = "windows")]
//! Somnia-Setup: WebView2 shell around the embedded NSIS payload. Windows only.
#[cfg(windows)]
mod assets;
#[cfg(windows)]
mod handoff;
#[cfg(windows)]
mod win;

#[cfg(windows)]
fn main() { win::run(); }

#[cfg(not(windows))]
fn main() { eprintln!("Somnia-Setup only runs on Windows."); std::process::exit(2); }
