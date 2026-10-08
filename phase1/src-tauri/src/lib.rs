#[cfg(feature = "desktop")]
mod desktop;
#[cfg(any(feature = "desktop", test))]
mod drop_grant;
#[cfg(any(feature = "desktop", test))]
mod image_io;
pub mod applog;
pub mod service;
#[cfg(feature = "desktop")]
pub use desktop::run;

pub mod lan_host;

pub mod agent_settings;
pub mod mcp_host;
pub mod oauth_login;
pub mod oauth_store;

pub mod provider_transport;
pub mod git;
