# Publication host integration (desktop commands)

Base: `int/gh-wave`. Package: remote layer, native service side of publication.
Wire contract: `src/lib/git/publication/types.ts`; review boundary: `docs/git/PUBLICATION-REVIEW.md`;
transport: `docs/git/REMOTE-ENDPOINTS.md`, credentials: `docs/git/CREDENTIAL-BRIDGE.md`.

Code: `src-tauri/src/git/publication.rs` (wire, mapping, registry, listings; host-neutral,
unit-tested with `cargo test --no-default-features`), `src-tauri/src/desktop.rs`
(Tauri commands + host glue, `desktop` feature: compiles in CI only), plus
`Project::dirty_paths` in `src-tauri/src/service.rs` and `src-tauri/tests/git_publication.rs`.

## Commands

| Command | Request | Reply |
|---|---|---|
| `git_push_plan` | `{request: PublicationTarget}` | `PublicationPlan` |
| `git_push_apply` | `{request: {planId, contentHash, confirmed: true}}` | `PublicationOutcome` |
| `git_fetch` | `{request: {remote}}` | `FetchResult` (renderer ignores the body) |

All three are gated like the local Git commands (`git_gate`, exactly one open project,
trusted repo). Errors reject as `RemoteError` JSON (`to_json`); `git_push_apply` instead
*resolves* typed outcomes (`stale-plan`, `denied-*`, `needs-*`, `failed`,
`uncertain-reconcile`), because a rejected invoke reads as "uncertain" in the controller
and only genuine transport uncertainty may mean that.

## Plan/apply exactness

- The renderer never sends a plan object. `git_push_plan` computes the native plan
  (`push::push_plan`: live remote observation, effective-URL validation incl.
  pushurl/insteadOf/pushInsteadOf rejection, non-FF/workflow/100-MB blocks) and stores the
  exact plan inputs plus the reviewed tree hash in a native registry (`Backend.publication`,
  single-use, 15-minute TTL, 8 entries). `git_push_apply` takes the plan out of the
  registry (unknown/expired/tree-mismatch → `stale-plan`) and replays the stored inputs
  through `push::push_apply`, which recomputes everything from live state and refuses on
  any drift. `Authority::Human { confirmed: true }` is built by the host from the
  confirmed review only. A taken plan is consumed whatever the outcome is: no re-apply.
- `contentHash` is the reviewed commit's tree hash (exact content). `head` is the commit,
  `remoteTip` the observed remote ref at plan time. `destinationValidated` is emitted only
  after the transport's URL validation pipeline ran.
- `account.id` **is the GitHub login**. The app has no numeric account id anywhere; the
  login is the only handle the person can type, and it is matched (case-insensitively)
  against the connected account and against the live `GET /user` answer. No inferred
  account fallback: a different or missing account is `needs-auth` / a rejected plan.
- Account and repository are validated **live** on every plan: `GET /user` (login still
  matches) and `GET /repos/{owner}/{repo}` (exact `full_name` match, `visibility` for the
  review dialog; a renamed repository fails as not-found). Responses are parsed for public
  identity fields only; bodies never reach logs, errors or the renderer.
- `untracked` / `excluded` are informational listings (`git ls-files --others` without and
  with `--ignored`, capped at 200) so the review shows what will *not* be published.
- `git_fetch` runs the transport `fetch` (tracking refs only). Fulfilling the seam means
  reconciliation succeeded: the following plan observes the real remote tip. A failed
  fetch rejects, the controller keeps its `uncertain-reconcile` state. No auto-retry.

## Credentials

No credential crosses the seam: wire types carry no field for one (a unit test asserts the
serialized plan/outcome JSON contains no token-shaped material). Nativ side: the token
stays in the OS keyring (`de.philipp-paulik.somnia.agent`, slot `github-oauth`) and inside
the credential bridge (`BridgeLeases` over `StoreTokenSource::new(KeyringBackend)`); git
sees only the opaque helper path. The helper binary `somnia-git-credential` is resolved
next to the app executable; packaging it as a Tauri sidecar/externalBin is **not part of
this patch** (see CREDENTIAL-BRIDGE.md) and is a release blocker for real pushes.
The GitHub API checks send the token only to `api.github.com`, redirects off, no proxy.

## Boundaries (explicitly not this patch)

- `ssh` and `gcm` auth routes deserialize (the UI offers them) but **fail closed**
  (`UrlRejected`): they are separate transport work, not a fallback from `github-https`.
- Agent-origin publication is impossible here: plans are always human, `PublishGrants`
  denies everything until a grant UI exists.
- Cancellation/progress: commands run with a detached `NetCtx`; `git_network_cancel`
  wiring is the job-engine slice.
- `set_upstream` after publish is off (no local config writes the person did not ask for);
  product decision pending.
- No new UI texts (i18n parity is vacuous here): native failures surface as the existing
  `publication.error` key plus typed outcome chips.

## Verification status

- `cargo test --no-default-features` covers: exact wire JSON of `PublicationPlan`
  (field-for-field against types.ts), all eight outcome kinds incl. the `denied-SSO`
  casing, inbound wire strictness (`deny_unknown_fields`, camelCase only), ssh/gcm
  fail-closed, outcome mapping (unverified push success → `uncertain-reconcile`, never
  `published`; `not-published` → `failed`), registry single-use/TTL/cap/tree-binding, and
  untracked/excluded listings against a real temp repo (integration test).
- Desktop glue (`desktop` feature: keyring, reqwest, Tauri commands) is **compile-verified
  in CI only**. The live GitHub run (private repo: publish, protected branch, SSO,
  workflow scope) remains the pending gate from CREDENTIAL-BRIDGE.md.
