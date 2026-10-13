# Deployment core

The deployment foundations live in `phase1/src-tauri/src/deploy/`. There is no
renderer IPC, UI, socket connection or shell invocation in this module. A real
transport and approval-gated commands are separate layers.

## Shared artifact contract

`src/lib/deploy/types.ts` and `deploy/manifest.rs` define the same camelCase JSON:

```json
{"kind":"static","files":[{"path":"index.html","sha256":"<64 lower-case hex characters>","size":42,"mode":420}],"buildId":"build-1"}
```

Node artifacts also require an `entry` pointing to a listed file; optional
`engines` is a string map and `port` is a nonzero u16. File modes are 0644 or
0755. Paths are slash-relative. Traversal, absolute and Windows paths, duplicate
paths, file/directory collisions, `.git`, `.ssh`, `.env*`, known private-key
filenames and key-file extensions are rejected. Static output excludes
`node_modules`; Node bundles can include prebuilt dependencies. Callers must
apply their project ignore rules and reject local symlinks when collecting an
artifact. This core accepts bytes, not local filesystem paths.

Validation happens before mutation. The exact byte map must match the manifest
and every size/hash is checked. The canonical digest sorts files by path and
covers modes, kind, entry, engines, port and buildId. Approval layers must bind
that digest together with the target and pinned host fingerprint.

## Typed transport and releases

`SshTransport` exposes filesystem operations, not arbitrary shell execution.
Real implementations must confine paths to the target root, reject symlink
ancestors and use the SFTP POSIX atomic rename extension. `MockSshTransport` is an
in-process filesystem with operation-count failure injection and no network
address parameter.

`ReleaseLayout::new(site)` accepts only bounded lowercase/digit/hyphen site ids.
It manages `/srv/somnia/<site>/releases`, `.partial` directories and a relative
`current` symlink. `release_id` uses zero-padded UTC Unix seconds and the first
12 characters of the canonical artifact hash, so ids sort by time.

- `stage`: verifies the complete local byte map, diffs the current manifest,
  uploads changed/added files, hashes and hard-links unchanged files, writes the
  release manifest, then renames the completed partial directory. It never
  switches the live site. Existing final releases cannot be overwritten.
- `activate`: re-hashes all files in a retained release, creates `current.new`,
  and atomically renames it over `current`. It returns the previous release id.
  The same method switches back after a failed health check.
- `cleanup_partials`: removes only valid partial release names.
- `prune`: keeps the newest configured number, always retaining the current
  release. Run it only after a successful health check, never before.

The service layer must serialize operations per target, check the host pin
before upload, enforce the human approval token, run health checks and restart
Node services as needed. There is no automatic publish or health claim here.
No data in `shared/` is touched or rolled back.

## Host identity and credentials

`HostKeyStore` is app-owned, never project-owned. It persists pins by canonical
host and port using a same-directory temporary file and rename. Missing pins
need human confirmation; changed pins hard-stop. `trust_new` cannot overwrite a
pin. `replace_confirmed` compares the expected old pin before replacing it.
The UI layer must enforce the separate reinstall confirmation and audit the
replacement. Corrupt stores fail closed. One app-owned store instance should be
shared by the service to serialize updates.

`KeyStore` creates Ed25519 keys directly into `SecretBackend`. Desktop builds
provide `OsKeychainBackend` using the existing
`de.philipp-paulik.somnia.agent` credential service and `deploy-key:<target>`
slots. There is no file fallback, and create refuses to overwrite an existing
slot. Only public key, fingerprint and slot metadata are serializable. Private
key Debug is redacted; encoded secret buffers are zeroized. Key creation,
removal and host trust must not be exposed to agent origins by a command layer.

`Redactor` removes supplied secret values, values from shared `.env`, private
key blocks, credential assignments, bearer tokens, common provider tokens and
URL credentials. `RedactedLog` buffers partial lines and hides private-key
blocks across chunk boundaries. Oversized incomplete output is dropped and
fails closed. Error enums contain only generic text, never raw SSH errors.
Redaction is defense in depth, not permission to log arbitrary server output.

## Tests

```sh
cd phase1/src-tauri
cargo test --locked --no-default-features deploy:: --lib
cd ..
./node_modules/.bin/tsx --test src/lib/deploy/types.test.ts src/lib/tauriPermissions.test.ts
npm run check:commands
```

Tests use only the in-process transport and memory credential backend. They
cover TOFU, pin replacement races, persistence/corruption, Ed25519 storage,
redaction canaries and chunk boundaries, file validation/diff, tampered remote
files, immutable releases, rollback, pruning and interrupted operations. No
real server is contacted. The desktop OS credential UI and a real SFTP atomic
rename require later platform/container checks; the mock is not proof of a
remote server's semantics.

The SSH dependency is exactly pinned to `russh 0.64.1`, with the ring backend and
without default aws-lc/compression/RSA features. Its SSH-key dependency is the
upstream `0.7.0-rc.11` pin; Cargo.lock captures the complete graph. No transport
adapter is shipped by this foundation patch.
