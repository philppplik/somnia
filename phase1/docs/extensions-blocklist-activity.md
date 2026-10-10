# Blocklist and permanent extension history

Branch: `ext/blocklist-activity`, base `1db70be`. Package naming is `.somniax` with `somnia-extension.toml`. This service is independent of package parsing and keeps legacy dotted IDs readable alongside lowercase dash IDs.

## Activity interface (popup branch 6)

`src/lib/extensions/securityActivity.ts` exports:

- `ActivityEvent`: `id`, `ts` (UTC ISO timestamp), `extensionId`, `extensionName`, `api`, `target`, `decision`, `kind`, `latencyMs`, `scope`. Nullable fields are represented as null.
- Decisions: `allowed`, `denied`, `prompted`, `changed`.
- Kinds: `permission`, `network`, `lifecycle`, `consent`.
- `ActivityFilter`: optional extensionId, decision, kind, search, before (exclusive), after (inclusive). Dates use canonical UTC ISO timestamps for lexical comparison.
- `queryExtensionActivity(filter, offset, limit)`: newest first, `{events, nextOffset, total}`, limit 1-500. Use `nextOffset` for archives as well as current history. Refresh resets pagination to avoid offsets shifting during new appends.
- `exportExtensionActivity(filter)`: local host save dialog, returns selected path or null on cancel. Export is filtered and contains the same sanitized events as search. The UI must confirm when the user chooses ALL saved history instead of the active filter.

Errors are real failures, not empty histories. Preserve removed extension labels using each event's saved extensionName. No sensitive RPC arguments, bodies, contents or authentication headers belong in events. UI action labels should be localized from the canonical API, not raw free-form extension output. `ext.security.*` strings exist in en/de/es/fr/pt-BR. No popup visual changes are part of this branch.

`src-tauri/src/extension_activity.rs` owns `<app_data>/extensions/<id>/activity.jsonl`. At 10 MB the current file becomes a unique archived segment. All segments remain indefinitely, including on disable/restart/update/removal. There is no automatic purge or uninstall hook. Host dispatchers append typed events with `extension_activity_commands::store(app)?.append(event)`; timestamp and event ID are minted by Rust. Write failures must surface a history-incomplete notice and should not be silently swallowed. Queries fail on corrupt/unreadable segments rather than presenting false completeness. Entire history is read/sorted for queries and streamed into a string for export; this first implementation favors correctness over very-large-history indexing and has no disk-full promise.

Desktop commands are registered in `desktop.rs` and restricted to the trusted main window. There is deliberately no renderer append command. A malicious extension cannot label its own calls as allowed or rewrite host history. Sanitization strips URL userinfo, query and fragment, known token patterns and control characters on write and read/export. The host must pass only concrete target paths/hosts and controlled permission scope descriptions, NEVER arbitrary arguments or response payloads. Logs are host-owned and extension filesystem grants must exclude their app-data directory.

## Feed consumer (signed store + host branches)

`BlocklistService` in `src/lib/extensions/blocklist.ts` consumes exact signed UTF-8 index bytes plus detached base64 signature. `ed25519IndexVerifier` verifies the exact bytes using a 32-byte bundled public key. It has no trust-on-first-use or download-key fallback. `signedIndexFetcher(indexUrl, signatureUrl)` uses HTTPS, rejects redirects, omits credentials, caps payload at 4 MiB/signature at 512 bytes, and times out at 15 seconds. URLs/key must come from the signed-store configuration. No production URL/key is invented here.

The signed envelope payload must expose:

```json
{"revision": 1, "blocked": [{"id":"svg-optimizer", "versions":">=1.0.0 <2.0.0", "reason_url":"https://publisher.example/security/advisory"}]}
```

Other signed-index fields may coexist. The store owner must adapt its schema if its revision or range shape differs. Ranges support `*`, exact SemVer, comparator conjunctions, and `||`. Unsupported npm shorthand such as `^`, `~`, partial versions, and hyphen ranges rejects the entire feed rather than silently failing to block. Prereleases participate explicitly in comparison. Reason links require HTTPS and no credentials; only explicit user actions open them.

Cache adapter persists `{payload, signature, verifiedAtMs}` only after signature and schema validation. On startup bytes are reverified, not trusted because a flag says so. `verifiedAtMs` is local freshness metadata, not part of signed trust. Unknown/missing timestamp yields unknown age. Lower revisions and different policies with the same revision are rejected. Last valid feed survives transport, signature and parsing failures. Offline age over seven days DOES NOT disable unrelated healthy extensions; cached matches remain blocked. Invalid signature marks store unavailable, with no unverified fallback.

`monitorBlocklist` checks on launch and every 24 hours. Caller keeps/disposes its returned timer with host lifecycle and handles reported errors/status. Call `blocked(id, version)` at every enable/load/install/update gate, and enforce the saved Rust block state before startup. Do not instantiate this policy consumer inside an extension-controlled webview. The trusted host/store owns its adapters; renderer WebCrypto verification is not a substitute for Rust installation verification.

## Disable + notify, never uninstall

Host adapter contract:

1. `installed()` returns authoritative installed identity/version/engine.
2. `disableBlocked(ext, block, revision)` first persists `BlockState::block`, drops capabilities, destroys logic/panel runtimes, waits for shutdown, and saves ordinary disabled state. It must also append `extension.blocked` lifecycle history. It MUST NOT remove packages, settings, secrets or project files.
3. `notify(ext, block)` runs only after successful disable acknowledgment. One scoped notice names the extension, says data is retained, and offers the reason link. The consumer deduplicates notices within this process; a new launch may show the still-blocked notice again.
4. `clearBlock(id, revision)` calls `BlockState::clear` only after a verified feed no longer matches. This removes the policy lock, NEVER re-enables. Ordinary user enable remains a separate action.

`extension_block_state.rs` persists the host block policy atomically at `<app_data>/extension-block-state.json`. `blocked(id, version)` gates BOTH native and sandboxed extensions; unreadable policy is an error, not permission to run. Version change allows the host to evaluate the new version against the verified feed, without inheriting a stale blocked-version record.

## Integration and QA boundaries

This branch provides functioning services and read/export IPC; the parallel host/store branches own authoritative RPC append hooks, disable runtime destruction, signed feed cache adapter and real feed configuration. Do not claim remote security enforcement is live before those adapters are wired. The legacy frontend registry remains unchanged to avoid inventing a renderer-local security boundary. No mock key, endpoint, install data or notification is shipped.

Unit coverage: archive retention across restart, filtered archive pagination/export, credential/query redaction, corrupt history failure, ID traversal rejection, persisted block state and rollback, exact/ranged/prerelease SemVer, offline >7-day behavior, signed-feed rollback/schema errors, disable-before-notify ordering, no notify on termination failure, real Ed25519 verification and bounded HTTPS transport. Desktop dialogs still require integrated platform compilation and manual save-dialog QA; no visual artifact is produced by this backend branch.
