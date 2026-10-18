# Recovery snapshots at rest: encryption proposal

Status: option 1 (retention, size cap, clear action) is implemented in the ported session-safety library (beta.5 line); the settings UI for the clear action is still to be wired (see session-safety.md). Options 2 to 4 are proposals. Decision owner: product. Related: [session-safety.md](session-safety.md), concept section 4 ("encryption is an open decision").

## What is stored

Recovery snapshots hold the current edited bytes of an unsaved Documents or Sheets file (plus view state and a Documents undo journal).
That is the user's document content, in IndexedDB of the app origin, unencrypted today. Snapshots never hold API keys, tokens or blob URLs
(enforced by `assertPlainView`). They are deleted when the document is closed, a Sheets copy is saved, or the user discards the session.

## Threat model (be honest about what encryption buys)

| Threat | Plain | Key in IndexedDB (non-extractable) | OS keychain key (desktop) | Passphrase |
| --- | --- | --- | --- | --- |
| Other local OS user / disk image of a locked disk | OS disk encryption decides | Weak: key sits next to the data | Protected | Protected |
| Cloud backup / profile copy of the WebView data dir | Readable | Readable only with the key store copied too | Protected | Protected |
| Malicious extension or XSS in the app origin | Readable | Readable (same origin can use the key) | Readable via the app's own API | Readable while unlocked |
| Forgotten-file leftovers after crash | Readable | Same as plain in practice | Protected | Protected |

## Options

1. **Keep plain, tighten retention (minimum).** Document that recovery data is local and unencrypted; add a TTL (7 days, same as the lifecycle
   spill), a per-store size cap, and a Settings > Performance "Clear recovery data" action. No new failure modes. Honest for a local-first editor
   whose source files are plain on disk anyway.
2. **AES-GCM with a non-extractable WebCrypto key stored in IndexedDB.** Cheap, works in web and desktop, no UX. Protects against casual
   inspection of the data directory and against copying the data store without the key store. Does not protect against same-origin code. Risk: key loss
   (cleared site data) makes snapshots unreadable, which is the same moment the snapshots disappear anyway.
3. **Desktop: random data key wrapped by the OS keychain (Tauri/Rust `keyring`).** Real at-rest protection against other users and backups.
   Needs a Rust command and a fallback path on Linux without a secret service. Not testable without a native build.
4. **User passphrase.** Strongest, but a recovery feature that asks for a password at crash time defeats its purpose. Not recommended.

## Recommendation

Ship option 1 now (retention, cap, clear action). Add option 2 for web and desktop as the baseline envelope (`schema 2`: header gains
`keyId` and `alg`, payload is ciphertext with a per-snapshot random IV, checksum covers header and ciphertext, decrypt failure is treated like
a corrupt snapshot and falls back to the previous slot). Add option 3 on desktop once the native build is available. Do not use passphrases.

## Format and code impact

- `snapshot.ts`: schema bump with explicit migration (`1` stays readable, new writes are `2`); `SnapshotError` gains `decrypt-failed`.
- `recoveryStore.ts` is unchanged (it stores opaque bytes).
- Key management in a new `snapshotKey.ts` behind an interface so the desktop keychain can replace the IndexedDB key without touching callers.
- Tests: tamper and wrong-key cases, schema 1 to 2 read, key loss behaves as "no snapshot" and surfaces the existing conflict notice.
- Effort estimate (unmeasured): option 1 about half a day, option 2 about one day, option 3 about one to two days plus native testing.

## Open questions for the owner

- Is plain-with-retention acceptable for the first release, or must option 2 ship with it?
- Desktop keychain: required, or later?
