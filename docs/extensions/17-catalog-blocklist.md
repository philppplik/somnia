# 17. Catalog blocklist (revocation enforcement for installed extensions)

Wires the extension blocklist to the signed catalog from [16-signed-catalog.md](16-signed-catalog.md). Before this, `BlocklistService` (`blocklist.ts`) had no key or URL configured in the shell build and was effectively off.

## Source of truth

The blocklist is the `revoked[]` array of the signed catalog index (schema 2), served from the [somnia-extensions](https://github.com/philppplik/somnia-extensions) repository and verified against the pinned catalog key `k1` in `phase1/src/lib/extensions/catalogTrust.ts`. One signed artifact now covers both install gating (store filters revoked entries) and revocation enforcement for already-installed extensions.

`catalogBlocklist.ts` projects the verified index onto the blocklist feed model:

- `serial` becomes the blocklist revision. Lower serials and same-serial-different-content are rejected; the policy only moves forward.
- Each `{id, versions[], reason}` revocation becomes a blocked entry. Exact versions are matched exactly (rendered as an equality-union range internally); the reason text is shown to the user, and the catalog repository is the published info link.
- The signature is checked over the exact index bytes with any pinned key, so key rotation needs no flag day. The `keyId` named in the payload must be pinned.

## Behavior

- An installed extension (sandboxed or native, legacy or v2 package) that matches a revocation is **disabled and the user is notified**. It is never uninstalled: package bytes, settings, history and secrets stay on disk. The notification is the same safety dialog the consent broker uses, shown once per block per app session.
- Disabled this way, an extension cannot be re-enabled while the block stands: the enable paths in the popup, the store staging flow and the candidate inspector all consult the same verified policy. When a newer signed index removes the revocation, the policy lock is cleared; the extension is **not** auto-enabled — the user switches it back on.
- Checks run **at launch and every 24 hours** (`monitorBlocklist`). Concurrent checks coalesce.

## Fail-safe offline

The last verified index is kept locally. On network failure, a transport error, a bad signature, an invalid schema or a rollback attempt, the last verified policy stays in force — the check reports `offline`/`invalid`, enforcement continues, and nothing healthy is disabled because the network is down. A restart re-verifies the cached bytes (signature, schema, serial) before enforcing them.

The 30-day catalog expiry deliberately does **not** apply here. Expiry bounds install and update decisions (the store pauses them); revocation enforcement is forward-only. An expired index therefore never lifts an existing block and never blocks anything new — only a newer validly signed serial changes the policy.

## Failure modes

`fresh` (verified new index), `offline` (transport failure, cached policy in force), `invalid` (bad signature, schema, key, rollback or conflict — cached policy in force), `never-fetched`. The feed status carries the last verified time and offline age in days. States and errors go to the app log; the controller never shows UI noise for a quiet offline machine.

## What is not done yet

- The native (tier B) runtime teardown on `blocklisted` invalidation lands with the supervisor/broker integration branch; the persisted policy lock already denies new sessions and enables.
- TUF (stage B) and immutable references: unchanged from 16-signed-catalog.md.
- A revocation proves the publisher pulled an extension. It does not prove anything about extensions that are not listed.
