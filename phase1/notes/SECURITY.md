# Trust boundaries

- Project HTML, JS, CSS and imported assets are untrusted content, not app commands.
- Preview content receives no Tauri IPC permission. Capabilities bind only to the trusted app window and exclude child frames/remote origins.
- Design preview runs with scripts disabled. Do not combine allow-scripts and allow-same-origin for same-origin project documents.
- Renderer applies restrictive CSP including script-src 'none', connect-src 'none', form-action 'none', object-src 'none'. Demo assets are embedded/local; external resources must not be loaded silently.
- Temporary node ID markers exist only in render copies. Source stays unchanged.
- Filesystem service validates project-relative paths, rejects traversal/symlink escape and expected revision conflicts. Stage/recovery and disk saved state are different.
- Import CI accepts regular files under phase1/ only. It writes only phase1-foundation and does not deploy. Replace import machinery with read-only test CI after integration.
- There is no AI execution, remote provider credential, telemetry or automatic upload in this phase.
