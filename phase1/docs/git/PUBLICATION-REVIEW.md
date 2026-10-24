# Publication review UI boundary

Base: 7dc7b652ece9ab62629078a887c915ff3c700b79. Feature: gh/publish-review-ui.

R2-C1/C2 frontend implementation. No network operation runs automatically, on save,
when creating a local version, or on agent launch. Explicit checkbox plus Publish
button is required for each single-use plan. Human dirty buffers warn; agent
publication is blocked by dirty buffers or missing explicit grant. Native apply
must independently enforce both rules and exact content/identity/destination checks.

## Integration with remote transport

`src/lib/git/publication/types.ts` is a renderer-safe view contract. R1 defines
semantic endpoint names but not a wire schema. The adapter is deliberately isolated:

- git_push_plan({request: PublicationTarget}) -> PublicationPlan
- git_push_apply({request: {planId, contentHash, confirmed: true}}) -> PublicationOutcome
- git_fetch({request: {remote}}) -> void

S4's finalized wire models must be mapped in createPublicationBackend. Do not
cast mismatched native results. This UI cannot enable a real publication until
that mapping and native capability registration are integrated and tested.

The remote picker can pass an optional PublicationTarget. Until that integration,
the desktop Publish tab accepts an account ID, remote and branch names explicitly.
It is not an account/repository picker. Native plan must resolve and validate the
selected account and repository visibility live. No inferred account fallback.

The UI must receive a destinationValidated flag only after the native service has
resolved pushurl/insteadOf/pushInsteadOf and rejected unsupported multiple URLs,
rewrites, redirects and hosts. No credentials may appear in the view model.
HTTPS routes reject userinfo, query or fragment; SSH view URLs use ssh:// canonical
form without userinfo. Unsupported SCP-style strings fail closed, not guessed.

Every plan must bind actual HEAD/content hash/branch/account/destination and the
observed remote ref. Native apply revalidates all bound inputs before non-force
push with explicit refspec; Published is returned only after remote read-back.
Raw native errors are never displayed. Rejected promises after apply are uncertain.

Stale and uncertain plans cannot reapply. Fetch and review must reconcile the
original remote of an uncertain operation before preparing a new target plan.
`fetch` fulfilling this seam must mean reconciliation succeeded, not merely that
fetch started. If unresolved, reject and preserve uncertain state. No retry.

Version state chips are a vocabulary legend, not a sync claim. History items are
local Versioned entries, never relabeled Published from cached ahead/behind data.
In Review is not asserted without a future verified PR integration.
Advanced review exposes actual SHAs, content hash, observed remote tip and plan ID.

## Tests

Focused node suite covers confirmation, grants/buffers, stale/uncertain outcomes,
URL/account/branch validation, request shapes and five-locale keys/placeholders.
`npx playwright test -c playwright.publication.config.ts` uses isolated mock props
and the actual app CSS, dialog and button primitives. It runs light/dark, dirty
buffers, exact apply payload, stale fetch/review and locale overflow cases.
The harness lives only under tests/publication and is not in the production entry.
Set CHROME_PATH for a different installed browser. No desktop or real GitHub push
is simulated as verified by these tests. Real private repo cross-platform gates
remain for the remote-transport integration.
