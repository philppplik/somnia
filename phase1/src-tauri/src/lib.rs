#[cfg(feature = "desktop")]
mod desktop;
pub(crate) mod no_window;
#[cfg(any(feature = "desktop", test))]
mod drop_grant;
#[cfg(any(feature = "desktop", test))]
mod image_io;
#[cfg(any(feature = "desktop", test))]
mod pdf_io;
#[cfg(any(feature = "desktop", test))]
mod audio_io;
#[cfg(any(feature = "desktop", test))]
pub mod vibespace_acp;
pub mod applog;
pub mod app_command_error;
pub mod cmd;
pub mod ignore;
pub mod intake;
pub mod service;
#[cfg(feature = "desktop")]
pub use desktop::run;

pub mod lan_host;

pub mod agent_settings;
pub mod model_locality;
pub mod mcp_host;
pub mod mcp_broker;
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
pub mod local_models;
pub mod local_voice;
pub mod local_hardware;
pub mod local_model_disk;
#[cfg(feature = "desktop")]
pub mod local_model_actions;
pub mod git;
pub mod git_credential;

pub mod sheets_io;
pub mod slides_io;
pub mod ext_scheme;

pub mod extension_activity;

#[cfg(feature = "desktop")]
pub mod extension_activity_commands;

pub mod extension_block_state;

pub mod diagnostics_types;
pub mod incidents;
pub mod diagnostics_zip;
pub mod panic_report;

#[cfg(feature = "desktop")]
pub mod diagnostics_commands;

#[cfg(feature = "desktop")]
pub mod vibespace_commands;
#[cfg(feature = "desktop")]
pub mod vibespace_acp_commands;
#[cfg(feature = "desktop")]
pub mod vibespace_schedule_commands;

pub mod preview_links;

/// Deployment foundations. No renderer IPC or remote connection is opened here.
pub mod deploy;
pub mod deploy_artifact;

pub mod runtime;
pub mod proc_runner;
pub mod command_terminal;

#[cfg(feature = "desktop")]
pub mod framework_preview;

pub mod deploy_targets;
pub mod deploy_guard;
pub mod deploy_runtime;
#[cfg(feature = "desktop")]
pub mod deploy_commands;

#[cfg(feature = "desktop")]
pub mod deploy_setup;
