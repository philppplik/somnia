# Remote endpoints (part 2/2)

Library: `src-tauri/src/git/remote.rs` (+ `remote/{net,pull,push,bridge}.rs`). No Tauri commands yet:
the host wraps each blocking function in a GitJob (spawn_blocking) and passes a `RemoteEnv`.

| Endpoint | Function | Network | Writes |
|---|---|---|---|
| `github_repositories` | `github_repositories(&dyn ApiTransport, &RepoListRequest)` | REST read (via adapter) | none |
| `git_clone` | `clone(&RemoteEnv, &CloneRequest)` | yes | staging dir, then moved into place |
| `git_fetch` | `fetch(...)` | yes | `refs/remotes/<name>/*` only |
| `git_pull_plan` | `pull::pull_plan` | no (run fetch first) | none |
| `git_pull_apply` | `pull::pull_apply` | no | safety ref `refs/somnia/safety/pre-pull-<unix>`, fast-forward |
| `git_push_plan` | `push::push_plan` | `ls-remote` of the target ref | none |
| `git_push_apply` | `push::push_apply` | yes | remote ref; local tracking ref after verify |
| reconcile | `push::push_reconcile` | `ls-remote` | none |
| `git_network_cancel` | `CancelRegistry::cancel(job_id)` | | |

## Plan / apply

`*_apply` takes the original plan request plus the reviewed `planId` and an `Authority`. It recomputes the
plan from live state (including a fresh remote observation for push) and returns `stale-plan` if the id
differs. A plan object sent by the UI or an agent is never trusted. `Authority::Human{confirmed:true}` must
only be built by the host from a real confirmation in the review screen; `Authority::Agent{grantId}` is checked
by `PublishGrants`. Neither exists in the library without the host supplying it.

Plan id binds: repo root, remote, canonical URL, account, local ref + commit + tree, target ref, observed remote
tip, scopes, workflow flag (push); branch, HEAD, target commit + tree, URL, overlapping local files (pull).

## Push

- Explicit refspec `<commit-sha>:refs/heads/<target>`, never force, never tags, never submodule recursion.
- Blocked in the plan: non-fast-forward, missing `workflow` scope when `.github/workflows/` changes, file over 100 MB,
  no `repo` scope. Warned: files over 50 MB, uncommitted files, unknown scopes.
- Outcomes (`PushOutcome`): `published{verified,reconciled}`, `rejected{reason}` (protection, SSO, auth, permission,
  workflow scope, non-FF), `not-published{reason}` (remote ref verified unchanged after cancel/timeout/offline),
  `uncertain` (remote could not be read). Interrupted pushes are reconciled by reading the remote ref.

## Safety

- Network calls run with `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, a reset
  credential-helper list, no `extraHeader`, only `https` allowed. The URL is the validated canonical one and is
  re-checked for rewrites.
- A lease may only add allow-listed `-c` keys and env (`SOMNIA_*`, `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`).
- Errors and stderr go through `redact` (URL userinfo, `gh*_` / `github_pat_` shapes).
- Pull apply: unsaved buffers block agent-origin applies and any file the update would replace.

## Integration boundary

- `LeaseProvider`: `remote/bridge.rs` adapts the S3 bridge (`BridgeLeases`). Needs the S3 patch first.
- `JobSink` / `NetCtx`: progress and cancel for the GitJob engine (S1). `CancelRegistry` is a stand-in.
- `ApiTransport`: adapter that performs `GET https://api.github.com<path>` with the stored token (not in this layer).
- `BufferGuard`, `PublishGrants`: host state.
- Tauri command registration and TS types are not part of this patch.
