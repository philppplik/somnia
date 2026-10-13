//! Platform-independent core of the Somnia custom installer.
//! The Windows shell (WebView2) drives this crate; everything here is unit-testable on any OS.
pub mod errors;
pub mod i18n;
pub mod options;
pub mod payload;
pub mod platform;
pub mod runner;
pub mod state;

pub mod no_window;
