# FTP / FTPS deploy target

A further target kind (`ftp`) next to SSH/SFTP, for static sites on shared hosting without SSH. Same seam as the SSH engine: `DeployService` (guard, plan hash, confirmation token, pinned identity) calls the `DeployEngine` trait; a `RoutingEngine` sends `ftp` targets to `FtpEngine` and everything else to the SSH engine unchanged. Code: `deploy/ftp.rs` (client), `deploy/ftp_engine.rs`, `deploy/ftp_testkit.rs` (in-process fake server for tests).

## Security
- Explicit FTPS only (`AUTH TLS`, `PBSZ 0`, `PROT P`). A server that does not offer it fails with `deploy:tls-required`. There is no silent downgrade. Implicit FTPS (port 990) is not supported.
- Credentials are sent only after the TLS handshake and the certificate check. The probe used for "trust this server" never logs in.
- Certificate verification is on by default: `ca` checks chain and host name against the system roots. `pinned` accepts only the leaf certificate (SHA-256) the person confirmed, for self-signed or mismatching hosting certificates. The pin is stored like an SSH host key (algorithms `tls-ca`, `tls-leaf`) and a change is a hard stop.
- Plain FTP exists only with `security: plain` and `allowPlain: true` (explicit checkbox and warning in the form, enforced again in Rust). Algorithm `plaintext`.
- The password is write-only: `deploy_ftp_password_set` stores it in the OS keychain (slot `deploy-ftp:<id>`), nothing returns it, and it is deleted with the target. It never appears in targets, plans, logs or errors.
- The PASV address from the server is ignored; the data connection goes to the control connection's peer.

## Publish
1. Connect, verify, log in. Read `.somnia-deploy/state.json` (SHA-256 per file) from the server.
2. Compare with the plan; only new or changed files are uploaded, each as `<name>.somnia-tmp` with a SIZE check.
3. Rename burst (HTML last). Replaced and removed files move to `.somnia-deploy/backup/<release>/`. A failed burst is undone.
4. SIZE verify, write the new state file, prune old backups. Files Somnia did not publish are never touched.

Rollback goes back one release (the previous one, or the initial state) from the backup folder.

## Remote listing
`deploy_remote_list` is read-only (directories first, with file sizes). It needs a pinned server like every other call. The Publish dialog shows it for ready FTP targets. Paths are relative to the target's folder.

## Limits
- FTP has no atomic directory switch, so the rename burst is "as atomic as FTP allows": files switch one by one within seconds.
- No HTTP health probe after publishing. One-level rollback only. No chmod. Empty directories remain after removals.
- Static sites only (no Node apps, no server preparation, no DNS step).

The state-file/tmp-then-rename approach was inspired by the ftpsync tool family. No third-party code is used.
