#[cfg(feature = "desktop")]
mod desktop;
pub mod service;
#[cfg(feature = "desktop")]
pub use desktop::run;
