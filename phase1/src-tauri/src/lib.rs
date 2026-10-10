#[cfg(feature = "desktop")]
mod desktop;
#[cfg(any(feature = "desktop", test))]
mod drop_grant;
#[cfg(any(feature = "desktop", test))]
mod startup_file;
#[cfg(any(feature = "desktop", test))]
mod image_io;
#[cfg(any(feature = "desktop", test))]
mod pdf_io;
#[cfg(any(feature = "desktop", test))]
mod audio_io;
pub mod applog;
pub mod app_command_error;
pub mod cmd;
pub mod ignore;
pub mod service;
#[cfg(feature = "desktop")]
pub use desktop::run;

pub mod lan_host;

pub mod agent_settings;
pub mod mcp_host;
pub mod mcp_health;
pub mod mcp_gateway;
#[cfg(feature = "desktop")]
pub mod mcp_studio;
#[cfg(feature = "desktop")]
pub mod mcp_http;
pub mod oauth_login;
pub mod oauth_store;
pub mod github_account;

pub mod provider_transport;
pub mod git;

pub mod sheets_io;
pub mod slides_io;
pub mod ext_scheme;

pub mod extension_activity;

#[cfg(feature = "desktop")]
pub mod extension_activity_commands;

pub mod extension_block_state;
