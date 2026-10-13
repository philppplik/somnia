# 16. Signed catalog (store hardening, stage A)

Implements SEC-C1, C2, C3 (partly), C5 and C8 from [14-security-model-v2.md](14-security-model-v2.md) for the catalog index. The catalog moves to its own repository, [philppplik/somnia-extensions](https://github.com/philppplik/somnia-extensions).

## What the app does
`phase1/src/lib/extensions/signedCatalog.ts` verifies a detached Ed25519 signature over the exact index bytes with a bundled public key before the index is parsed for display or install. Checks, in order: pinned-key signature, schema, `keyId` is pinned, not expired (max 30 days validity), not future-dated, serial not lower than the last verified one, same serial means identical bytes, system clock did not move backwards. Entries listed in `revoked[]` are removed from the install list. The last verified serial and a verified copy of the index are kept locally; on network failure the cached copy is re-verified and used (expiry still applies).

Failure modes are explicit and fail closed: `no-keys`, `bad-signature`, `unknown-key`, `invalid`, `expired`, `rollback`, `conflict`, `clock-rollback`, `future`. An expired index pauses installs and updates; installed extensions keep running.

## Index schema 2
`{ schemaVersion: 2, serial, issuedAt, expiresAt, keyId, extensions: [schema-1 entries, incl. reviewed/reviewedBy], revoked: [{id, versions[], reason}] }`. Entry fields are covered by the signature, so `reviewed` cannot be flipped without the key. Revocations list exact versions, no ranges.

## Switch
`catalogTrust.ts` pins the public keys. While the list is empty the app keeps reading the legacy unsigned index. Adding the real key is the switch, and the legacy path is not used after it. Two keys (current + next) can be pinned for rotation.

## What is not done yet
- TUF (stage B): `tools/extension-store/tuf.ts` is Node-only and not wired into the app. Needs a native adapter.
- The signed `revoked[]` list is enforced for install and update lists and, since [17-catalog-blocklist.md](17-catalog-blocklist.md), for already-installed extensions: the shell's `BlocklistService` now consumes this index with the pinned key k1 (disable + notify, launch + 24h checks, fail-safe offline).
- Immutable references: the app reads the `published` branch head. Rollback is stopped by the serial, not by the URL.
- Honest scope: a signature proves who published the index and that package bytes match the pins. It does not prove an extension is safe.

Key handling, rotation and loss: see `docs/KEYS.md` in the somnia-extensions repository.
