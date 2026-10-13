# Deploy SSH transport

Rust side of live deployment: `phase1/src-tauri/src/deploy/ssh.rs` (transport), `bootstrap.rs` (one-time server setup), `ssh_testkit.rs` (test server). The renderer never sees a key, password or socket.

## What it does

- `probe_host_key` reads the server's host key without authenticating. The UI shows the fingerprint; only after the user confirms does `HostKeyStore::trust_new` pin it.
- `RusshTransport::connect` needs a pinned key. Unknown or changed keys abort the handshake before any credential is sent (`FailureKind::HostKeyUntrusted` / `HostKeyChanged`, with both fingerprints for the dialog). Certificates are not accepted.
- Auth is the keychain deployment key (`Credential::Key`) or, for first-time setup only, a password that lives for one connection (`Credential::Password`).
- `RusshTransport` implements `SshTransport` over SFTP. Paths must live under the root (default `/srv/somnia`), contain no `.`/`..`/empty parts and no symlink ancestor (checked on the server, cached, cache dropped after rename/symlink/remove). `rename` uses `posix-rename@openssh.com` and fails if the server lacks it, never delete-then-rename. `hard_link` uses `hardlink@openssh.com`. `symlink` sends (target, linkpath) in OpenSSH wire order. `hash` reads the file back from the server.
- `SshExec::exec` runs a command with optional stdin (stdin is always closed). Output is redacted, capped, with a timeout. Lines starting with `SOMNIA_` are returned separately in `markers` so long logs cannot hide a result.
- `bootstrap::run` stages the rendered script in a private temp file, runs it as root, via `sudo -n`, or via `sudo -S` with the password on stdin only, and deletes the file again. The script is rendered from validated fields only, is idempotent, prints a `SOMNIA_*` marker protocol and the server's ed25519 fingerprint. Outcomes: done, sudo denied, unsupported server, port 80/443 in use, failed step.

## Errors

All errors are the generic `DeployError`. `ConnectFailure` adds a coarse `FailureKind` (unreachable, timeout, untrusted, changed, auth rejected, protocol, invalid input) so the UI can choose a plain sentence. Auth failures and unreachable hosts both map to `DeployError::Transport`; a dedicated `DeployError` variant would need a shape change in D1 (proposed, not made).

## Tests

`cargo test --lib deploy::` from `phase1/src-tauri` (add `--no-default-features` to skip the desktop shell):

- `ssh_testkit` is an in-process russh server on 127.0.0.1 with an SFTP backend on a temp directory, OpenSSH-compatible extensions, scripted exec results, request counting and failure injection. No real server is ever contacted.
- One test starts a throwaway OpenSSH `sshd` on loopback as the current user (skipped when `sshd` or `sftp-server` is missing) and checks symlink wire order, posix-rename, hardlink and exec against the real implementation.
- The release flow (`ReleaseLayout`) runs end to end over SSH, including a sweep that fails each SFTP request in turn and checks that the live release keeps serving.

The bootstrap script is syntax-checked with `sh -n` and its injection guards are tested. It has not been run against a real Debian or Ubuntu host in this change.
