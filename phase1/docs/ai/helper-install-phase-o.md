# Optional helper installation, phase O concept

The helper is an optional app-data asset, never bundled. A release-reviewed build embeds a target-specific manifest from real CI output. No runtime user-supplied executable URL or mutable network feed. Until a reviewed target manifest and immutable URLs exist, installation is visibly unavailable and no download begins. Both voice preview flags remain default-off.

Before install or repair, show exact executable bytes, source, SHA-256, engine revision, MIT license and reviewed complete notices. Consent is bound to that artifact identity. Native code checks capacity, downloads into private staging, constrains HTTPS redirects, verifies exact size/hash and notices, and publishes a versioned directory atomically. Runtime lookup is app data only and rehashes before each use. Repair never silently runs a downloaded helper. Remove affects only the installed helper, not the speech model; no delete during active voice work.

Crash cleanup: Linux child must die with its parent and startup sweeps private stale job folders. Windows helper uses a kill-on-close job object. Never kill a persisted PID on restart because PID reuse could kill unrelated work. macOS remains deferred. Platform process confinement is a separate release gate and needs native CI, not a claim inferred from local code structure. Transcription still does not upload audio. Model/asset downloads are explicit network operations.

CI checks must demonstrate parent crash, cancellation and timeout, child/grandchild lifetime, scratch cleanup after restart, corrupt/mismatched artifact rejection, interrupted repair preserving the prior helper and no inference egress. Default-off until these pass. No real URLs/hashes are authored in this slice.

## Current implementation and honest boundaries

The compile-time voice-releases.json is empty. Install/repair and lookup fail closed until a reviewed target record has real URLs, size/hash/notices and all release gates. No bundled helper path is used for inference anymore. Same-host HTTPS redirects only; cross-host CDN redirects require a reviewed direct artifact source, not an implicit wider host allowlist.

Repair stages all bytes and notices before replacing the old directory, with rollback and startup recovery of a hash-keyed backup. Every lookup rehashes both files; deletion blocks active voice jobs and preserves model weights. The exclusive app-data lease is acquired before startup cleanup, never inferred from a saved PID. Unix lock file is private and opened without following symlinks. Owned partial model files, job scratch and helper staging are cleaned only on startup with the lease held. Cleanup failure keeps voice unavailable.

Linux direct-child parent-death signal and Windows kill-on-close Job Object have been added but are NOT proof of crash-safe process-tree cleanup: grandchildren and the Windows assignment window still require the documented checks and possible supervisor/suspended-start work. No inference sandbox is implemented by this slice. The release list cannot admit an asset with unproven flags. Actual native compile, filesystem/network installer integration, device inference and egress/crash tests remain CI-only.

## Roadmap-Delta

Added exact-artifact consent, optional app-data helper installer, checksum/notices verification, runtime lookup, explicit remove/repair, transactional repair backup recovery and startup cleanup/ownership. Added fail-closed empty release list and Windows/Linux native contract CI paths. Added the concrete egress/crash test plan in voice-egress-ci-plan.md. Not added: fabricated release URLs/hashes, a generally enabled voice feature, production egress sandbox, proven process-tree crash cleanup or native execution evidence.
