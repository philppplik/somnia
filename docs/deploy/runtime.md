# Deployment runtime

`deploy_runtime::build_service(config_dir, source)` wires `DeployService` to `FileTargets`, the app-owned `HostKeyStore`, `RuntimeKeys` using the OS keychain, and `LiveDeployEngine`. Initialization returns a storage error rather than dropping to temporary pins. Pin changes retain the observed algorithm and are checked again after persistence.

## Static flow

The native command resolves exactly one opened project folder. Renderer paths are never accepted. Framework projects use F3's detected output folder and collector; the UI must complete a successful local build through ProjectRunner before planning. A propose-level plan never runs project scripts. Plain HTML folders use a bounded walker respecting project `.gitignore`/`.ignore` rules and rejecting links; secret and editor metadata paths are excluded.

Planning opens a read-only pinned SSH session, reads the current manifest, collects the artifact, and produces an exact add/change/remove/unchanged diff. The private byte cache is bounded and never crosses IPC. Execution consumes the one-time token and recollects/replans before using cached bytes. The approval hash binds the target metadata, fingerprint, live release, build and file list. Editing the target or changing the artifact or live release invalidates approval.

Publishing checks the prepared `releases`/`shared` layout, write access, available disk space, required tools, and Caddy admin socket. It cleans interrupted partial releases, uploads into an unserved partial, verifies every file, hard-links unchanged verified files, and renames the completed directory. Release ids combine D1's sortable Unix time/content hash with a random suffix to avoid same-second collisions.

`connect`, `check`, `upload:n/m`, `switch`, and `health` are emitted on the existing `deploy-progress` event. A cancellation flag is checked during upload and immediately before entering switch. The switch boundary is guarded by the same mutex as cancellation. Once switch starts, cancellation returns false.

The static Caddy configuration points at `current` and respects the target's SPA flag. Reload goes through D2's fixed non-sudo command. The engine verifies remote hashes and an HTTPS response's index hash with normal TLS validation, bounded HTTPS redirects and a 20-second request timeout. No insecure certificate bypass exists. A configuration/reload/health failure restores the previous release and Caddy file; a first publish failure removes the new live symlink. If restoration also fails, it reports that separately. Certificate issuance or DNS not being ready is a health failure, not a claimed live HTTPS success.

A successful publish keeps five releases including the live one. Retention failure is best effort and does not claim the healthy publish failed. Rollback verifies the saved release again before switching and performs the same health/recovery flow. Upload-only targets use the immutable release layout but do not manage Caddy or claim an HTTPS URL.

## IPC additions

All three are main-window gated, included in build manifest, capabilities, handler registry, generated command names and typed command contracts:

| Command | Arguments | Result |
| --- | --- | --- |
| `deploy_key_public` | `{targetId: string}` | public OpenSSH key string |
| `deploy_live_release` | `{targetId: string}` | release id or null |
| `deploy_cancel` | `{targetId: string}` | true only for an active pre-switch operation |

`deploy_releases` remains an array of ids for backward compatibility. Combine it with `deploy_live_release` to mark the live row. Stable errors include `deploy:cancelled` (`EngineError::Cancelled`) and `deploy:server-not-prepared` (`EngineError::ServerNotPrepared`).

## Node extension seam

`LiveDeployEngine::with_node_engine(Box<dyn DeployEngine>)` supplies the separately implemented Node pipeline. Node plan, publish, rollback, releases, live lookup and cancellation delegate to it. Without that delegate, Node operations fail closed with preflight failure. The static path is not reused for server apps.

## Validation

Engine integration tests use the real russh/SFTP client against the in-process SSH testkit on loopback only, with generated keys and a temporary jailed filesystem. Exec responses simulate the prepared server, Caddy reload and HTTPS hash without any real host, external certificate service, bootstrap or package installation.

Coverage includes publish/diff/progress/rollback/live lookup, automatic restoration after health failure, changed artifact and target after approval, the cancellation boundary, host-key mismatch before authentication, and plain-site ignore/secret exclusion. D1's interruption tests continue to verify preservation of the live release at every failing SFTP operation.
