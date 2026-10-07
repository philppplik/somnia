# Trust boundaries

- Project HTML, JS, CSS and imported assets are untrusted content, not app commands.
- Preview content receives no Tauri IPC permission. Capabilities bind only to the trusted app window and exclude child frames/remote origins.
- Design preview runs with scripts disabled. Do not combine allow-scripts and allow-same-origin for same-origin project documents.
- Renderer applies restrictive CSP including script-src 'none', connect-src 'none', form-action 'none', object-src 'none'. Demo assets are embedded/local; external resources must not be loaded silently.
- Temporary node ID markers exist only in render copies. Source stays unchanged.
- Filesystem service validates project-relative paths, rejects traversal/symlink escape and expected revision conflicts. Stage/recovery and disk saved state are different.
- CI has a read-only token and does not deploy; releases are assembled by hand from its artifacts ([BUILD-AND-RELEASE.md](../../docs/BUILD-AND-RELEASE.md)).
- No telemetry and no automatic upload. The Agent sends project text to a model provider only after the user configures a provider, enables cloud consent (not needed for a verified local Ollama model) and approves each file read; writes are proposals reviewed before they reach the editor. See [docs/agent/ARCHITECTURE.md](../../docs/agent/ARCHITECTURE.md).
- Commands are limited to the `main` window by `gate()` and by the explicit `editor` capability; the full ACL is in [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#32-command-surface-and-acl).
- Logs are redacted before storage and never contain prompts, file contents or tool arguments ([docs/LOGGING.md](../../docs/LOGGING.md)).
