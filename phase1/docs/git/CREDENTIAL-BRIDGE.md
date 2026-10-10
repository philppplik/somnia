# Git credential bridge (Remote layer, part 1/2)

Code: `src-tauri/src/git_credential/` (host), `src-tauri/src/bin/somnia-git-credential.rs` (helper),
tests `src-tauri/tests/git_credential_bridge.rs` plus unit tests in `remote.rs`.

## Contract for part 2 (remote endpoints)

```rust
// 1. Validate BEFORE anything else. No token involved.
let remote = validate_remote(repo_dir, "origin", Operation::Push /*or Fetch*/, &Policy::github())?;
let remote = validate_clone_url(url, &Policy::github())?;            // clone / ls-remote by URL
// 2. One lease per job. Preflight surfaces needs-input before git runs.
let lease = CredentialLease::open(
    LeaseSpec { account_login, remote: remote.clone(), ttl },
    Policy::github(), token_source /* Arc<dyn TokenSource> */, helper_path)?;
// 3. Run git. args[0] is the subcommand; remote.url must be one of the args.
let out = run_git_with_lease(&lease, &remote, cwd, &args, timeout, Some(&cancel_flag))?;
// 4. Reconcile.
let o = lease.outcome();   // served, refused, auth_rejected (git called `erase`: 401/403)
```

* `BridgeError::is_needs_input()` maps to the GitJob outcome `needs-input` (store locked, not connected,
  scope upgrade, other account). URL-policy errors are plain failures. `Timeout`/`Cancelled` mean the
  remote state is uncertain: reconcile (ls-remote) before a retry.
* `auth_rejected` means GitHub refused the token (revoked, SSO not authorized, no access). The stored
  token is not deleted; part 2 re-validates the account and asks the user.
* Always pass the validated URL in argv (no userinfo) and an explicit refspec for push. Allowed
  subcommands: clone (Clone), fetch/ls-remote (Fetch), push (Push). `-c`, `--config*`, `--upload-pack`,
  `--receive-pack`, `--exec`, `--template` and any second URL are refused.
* Token source for the app, in `desktop.rs` where `KeyringBackend` lives (not added here, desktop feature
  not buildable on the build host): `Arc::new(git_credential::StoreTokenSource::new(KeyringBackend)) as Arc<dyn TokenSource>`.
* Helper path: the `somnia-git-credential` binary must ship next to the app executable (Tauri
  externalBin/sidecar, NOT configured here). Resolve via `current_exe().parent().join(...)`.

## Design

* Per-job endpoint: Unix socket in a fresh 0700 directory (socket 0600, same-user peer-credential check via
  SO_PEERCRED / getpeereid) or a Windows named pipe (remote clients rejected). 256-bit random nonce passed
  to git through the environment; the token appears only in the one JSON response line and in the helper's
  stdout to git.
* Host policy per request (refusals are counted): nonce, not cancelled, not expired (ttl 1 s to 15 min),
  scheme, host incl. port, path == leased `owner/repo` (case-insensitive, `.git` optional; git must send the
  path: `credential.useHttpPath=true`), at most 6 `get`s.
* Git prefix (`lease.git_prefix_args()`): `credential.helper=` reset then our helper (command-line config is
  read last, so URL-scoped foreign helpers from any config file are cleared too), `useHttpPath`,
  `core.askPass=`, `http.extraHeader=`, `http.followRedirects=false`, `protocol.allow=never` plus the policy
  scheme only (no ssh, file, ext).
* URL validation: the effective fetch/push URL (after `pushurl`, `insteadOf`, `pushInsteadOf`) must equal the
  configured URL and be exactly `https://github.com/owner/repo[.git]`: no userinfo, port, query, fragment,
  percent-encoding, extra path. Several URLs and any rewrite are rejected. SSH is a separate route, never a
  fallback. GitHub Enterprise is not supported.
* Captured git output is capped and every token the lease served is replaced by `[redacted]`.

## Caveats

* Windows named-pipe transport and the helper on Windows are type-checked (cargo check, target
  x86_64-pc-windows-gnu, module in isolation) but NOT executed. Needs the Windows gate run.
* The macOS `getpeereid` path compiles by construction but was not run (tests ran on Linux).
* Tested against a local fake smart-HTTP server (plain HTTP on 127.0.0.1 via `Policy::loopback_for_tests`),
  not real GitHub. The gate's disposable-repo run (success, denied push, SSO, workflow scope) is open.
  `Policy::loopback_for_tests` is public so integration tests can use it; it only permits 127.0.0.1.
* `workflow` scope (lazy reconnect) is not handled: the scope check still requires `read:user repo`.
* The git child's environment holds the endpoint path and nonce (same-user readable); neither yields a
  token without a peer-credential-checked connection and a matching request.
* No SSO/protected-branch error classification here; part 2 classifies git's failure after `auth_rejected`.
