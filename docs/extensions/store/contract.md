# Store catalog schema 1

This branch implements data contracts, validation, publisher authorization, lifecycle
and review policy, and signed catalog publication/verification. It does not claim a
running marketplace or a safe extension host. Existing `catalog.ts` remains the
legacy catalog and is not upgraded or authenticated by this work.

## Integration entry points (Store UI branch)

Import from `phase1/src/lib/extensions/store/index.ts`. This barrel has no React,
Tauri, filesystem or network dependencies. The exported types are the wire contract:

- `StoreCatalog`: independently versioned `catalogSchemaVersion: 1`, increasing
  `sequence`, policy revision, publishers, listings and permanent ID tombstones.
- `Publisher`: numeric GitHub owner/submitter/repository bindings. GitHub 2FA is a
  declaration, not a verified identity badge. `official` and domain verification
  must be maintainer-assigned, never registration inputs.
- `StoreListing`: plain-text name, summary and category, plus per-version releases.
- `Release`: namespaced `publisher.extension`, strict SemVer without build metadata,
  distinct stable/prerelease channel, sandboxed engine, `.somniax` artifact and
  root `somnia-extension.toml`. Package format 2 and API version remain independent.
- `ReleaseEvidence`: nine digest/source/PR-bound gates, scanner versions/dates,
  review records, finding-bound exceptions. No numerical safety score.
- `AssetInventory`: generated raster metadata bound to extension/version/package
  digest. Source image paths are not Store URLs. Assets expose opaque SHA-256 keys.
- `SecurityFeed`: explicit version lists and/or identity/digest matches. No SemVer
  range parser is supplied in this first implementation; producers must expand
  ranges to reviewed version lists before publication. Unknown forms fail closed.

`parseStoreCatalog` validates untrusted records but is NOT a trust boundary.
Only a catalog returned by the TUF adapter (or equivalent native implementation)
may be presented as Store-approved data. Never pass raw GitHub PR JSON directly
into an install flow. Never adapt an unsigned legacy entry to a reviewed release.

`evaluateReview(release, evidence, {prHead, policyRevision, now})` returns stable
code/path diagnostics. Every required gate must be present exactly once, bound to
current bytes/source/PR. All releases need human review. Project writes, network,
credentials, clipboard reads and WASM need two distinct reviewers including a
security maintainer. Runtime WASM eligibility remains blocked by runtime launch
gates, not granted by this review helper. Scanner reports are trusted worker
inputs, not publisher self-certification. Exceptions are conservative: only
non-hard heuristic findings can be waived; no unavailable/not-run gate is waived.

`transitionRelease` enforces quarantine/review/approval before listing and requires
signed publication. Its `actor` is an already-authenticated principal from the
caller, not publisher JSON. `assertImmutableRelease` prohibits rewriting published
version records. New evidence/artifact content needs a new immutable record/version.

`registerPublisher`, `authorizeSubmission` and `validatePublisherChange` consume
verified numeric actor/challenge facts. Registration requires a matching owner PR,
public challenge commit and maintainer approval; namespace transfers require both
owners, renewed control and domain suspension. Submitter changes require owner
approval. No function performs GitHub identity verification or creates an account.

`installability` supplies an install/update policy decision after metadata checks.
`matchingRevocations` matches dangerous bytes even under another extension ID;
clearance must explicitly supersede a signed incident. Cached blocks do not expire.
`evidenceCard` emits individual statuses and flags dependency checks stale after
72 hours. Render plain text, not badge HTML. No status is a safety guarantee.

## Signed delivery

`tools/extension-store` is a separate Node 22.22.2+ package, not part of the browser
bundle. Run `npm ci --ignore-scripts`, `npm test`, `npm run typecheck` there.
`tuf-js` and `@tufjs/models` implement TUF instead of custom signature-only checks.

`buildPublication` receives an app-pinned root and signer callbacks, never creates
or persists private keys, fetches packages or executes candidate code. It checks
root/role signatures, then produces consistent snapshot metadata and hash-prefixed
targets. It requires actual matching evidence and inventory bytes for installable
releases, validates review gates and checks inventory binding before signing.

Roles: targets 30 days; delegated `security` seven days restricted to
`security/revocations.json`; snapshot seven days; timestamp 48 hours. Root must be
consistent-snapshot and unexpired, with its operational keys established offline.
Root thresholds/custody are configured by the maintainer, not invented here.

`refreshStore` bootstraps only from a supplied app root, retains persistent TUF root
and metadata versions, refreshes roles and validates downloaded catalog and security
targets before parsing. It checks application sequence rollback, clock rollback,
retains incident history and refuses rewriting existing incident decisions. It
uses credential-free, no-redirect, origin-bound HTTPS and bounded downloads.

CLI:

```sh
npm run catalog -- validate catalog.json revocations.json
npm run catalog -- refresh app-root.json private-cache https://store.example/metadata/ https://store.example/targets/
```

The example domain is illustrative, not a deployed repository. `validate` proves
shape only. `refresh` prints verified data; cache directory must be app-owned,
private and serialized by a single updater. Never use a publisher-controlled cache.

Publication is a protected-environment library call. Upload the generated
content-addressed targets and versioned role metadata first, timestamp last. Keep
previous targets and snapshots available. A security-only incident publication
can reuse catalog bytes and bypass the review queue, but must update security,
snapshot and timestamp coherently. Do not expose signing callbacks to PR jobs.

## Policy vs runtime

Store Criteria 16 governs catalog policy: TUF, separate security feed, six-hour
refresh advice, seven-day stale pause advice and executable review gates.
`storeFreshness` returns policy advice only. It does not disable or uninstall an
extension, run an app timer, broaden a grant or remove project files.

The separate security concept governs app runtime tiers, grants, consent and its
own offline behavior. Its bare-index/24-hour/offline rules conflict with Criteria
16; this branch does not silently change those runtime rules. The integration owner
must resolve behavior at the native activation boundary and expose freshness and
pending decisions in the UI. A catalog signature never grants runtime capability.

Package naming follows the assigned `.somniax`/TOML contract despite legacy JSON
examples in supplied assets material. Store limits are stricter: 2 MiB compressed,
10 MiB expanded, 256 files, 2 MiB/file; identity source <=512 KiB; one to five
screenshots <=1 MiB each. Asset inventory schema 1 follows the richer asset contract
for generated 512px identity derivatives. Local developer package budgets are not
expanded by Store publication. The inventory check is not image decoding or proof
that conversions ran in isolation.

## Not shipped / launch blockers

- No Store repository, production keys/root, deployment, CODEOWNERS/protected branch
  configuration, incident staffing or real publisher registration is created.
- Scanner execution, deterministic builds, actual-host review and OIDC attestation
  verification are separate workers. This branch consumes their evidence, never
  substitutes an attestation claim for verified provenance.
- Native/browser bridge, atomic package installer, permission normalization/digest
  computation, runtime host enforcement and consent are other branches. The adapter
  is not wired into the old Store UI. Public third-party launch remains gated.
- Full DNS challenges, public-suffix checks, observed 180-day domain tenure and
  monthly domain jobs remain operational follow-up; display `pending` meanwhile.
- Artifact extraction/path limits and canonical image conversion are package/asset
  owners' work. Asset bytes need their own authenticated transport and SHA-256 check.
- Reserved official namespace registration needs a dedicated maintainer route;
  ordinary registrations intentionally reject `somnia`, `official`, `admin`, support
  namespaces and prefixes. Confusable display-name review remains human moderation.
- Schema objects tolerate additive fields except closed engine/state/capability
  vocabularies. Future wire schemas require explicit version changes; UI must not
  interpret unrecognized fields as permissions, approvals or trust indicators.

Tests use synthetic publisher/release evidence and temporary Ed25519 keys. No fixture
is a real listed extension. Acceptance covers malformed catalog/binding/limits,
reserved IDs, transfers, review gates, stale databases, distinct reviewers, lifecycle,
revocations/freshness, generated asset references and real TUF verification including
bad signatures, changed bytes, expiry, wrong root, rollback and old/new root rotation.
