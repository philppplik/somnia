#[cfg(feature = "desktop")]
mod desktop;
#[cfg(any(feature = "desktop", test))]
mod drop_grant;
pub mod applog;
pub mod service;
#[cfg(feature = "desktop")]
pub use desktop::run;

pub mod lan_host;

pub mod agent_settings;

pub mod provider_transport;
