# ADR: native AI document boundary, phase 1

Status: implemented as a local patch series against `somnia-agent` at
`5c1199c`. No release, publication or repository push is part of this work.

## Inventory at the pinned baseline

- `packages/editor-core/src/index.ts` owns HTML trees, stable node IDs, source
  ranges, transaction validation and snapshot history. Canvas and source edits
  use this service. Transactions are atomic; the baseline history restores
  snapshots, not selective CRDT inverses.
- `src/store/appStore.ts` owns the live project port, dirty state, generation,
  current tab and selection. Native and draft save paths are separate.
- The Agent sidebar uses `AgentSession`, providers and `AgentProjectTools`.
  Its baseline context fields were not used to build a structured context
  package. `setAgentEditorAccess` had no app caller.
- Baseline Agent tools include whole-file reads/proposals and CSS helpers.
  MCP is a separate local runtime with execution tools. ACP is outside this
  native document transaction path.
- Collaboration shares editor text through Yjs and the project bridge.
  It does not provide safe selective undo for semantic snapshot transactions.
- Photo, vector and PDF have separate models and histories. A format name is
  not an implemented shared adapter.

## Decision and implemented path

`DocumentRegistry -> buildContext -> scopedProvider -> typed tools -> native
proposal -> complete preview -> TransactionManager -> editor-core`

The registry gives text buffers a document ID, studio kind, revision and
adapter ID. Identity survives explicit editor rename. Close/reopen and project
replacement invalidate old references. Core revision changes conservatively
invalidate registered references, including metadata/lock changes and
same-text edit/undo cycles. This can invalidate a proposal after an unrelated
file edit; it is safe but intentionally conservative.

The context broker pins the active document and its revision at run start.
It uses a nonempty CodeMirror selection, otherwise a selected native DOM node,
otherwise the active document. It includes provenance as untrusted data and
rejects context above 64 KiB rather than silently truncating. No project sweep
or previous-document chat replay occurs: each run has a fresh provider session.
Tab switching cannot retarget a run. Tools can request other ranges within
this explicitly inspected active document, never another document.

The host-owned gateway separates inspect, disclose, edit and external-effect
grants. Inspect requires the active-document checkbox or a per-run prompt.
BYOK cloud disclosure requires the named-provider checkbox for that run and
existing cloud consent. Changing provider or active file clears that checkbox;
sending consumes it. Local Ollama must pass the existing positive local-model
verification. Remote/cloud passthrough Ollama is denied in native studio mode.
Provider credential storage and transport remain unchanged.

Only native tools are advertised in the real sidebar:

| Tool | Capability |
| --- | --- |
| `code_read_range` | Bounded revision-pinned source inspection |
| `dom_inspect` | Native node IDs, authored attrs, source ranges, selection |
| `code_propose_html` | Validated HTML range replacement |
| `dom_set_attribute` | Parser-backed native attribute transformation |

HTML tools are advertised only for HTML buffers. Other Code buffers expose
read-only ranges. Unsupported formats have no native editing buttons. Existing
legacy tool modules remain tested independently, but the real native sidebar
has no `write_file`, CSS multi-file, shell, MCP or ACP fallback. Reintegrating
MCP requires its own effect policy and enforceable process boundary.

Typed transformations simulate in a separate editor instance. Locked nodes
and ancestors are denied. HTML is parsed with parse5 before staging. Event
attributes and `srcdoc` are not supported. The full proposal remains a single
review/accept unit, not arbitrary hunks. No model tool can accept it.

The sidebar shows a source diff and an optional isolated before/after HTML
preview. Its iframe has no sandbox capabilities and a restrictive CSP: no
scripts, network, project CSS/assets, forms or fonts. It is explicitly labelled
as source-only, not a pixel-faithful project renderer. Actual before/after preview pixels, source diff, acceptance controls and the
accepted/dirty editor were visually inspected in the generated screenshots.

Scripts in the proposed
source are still visible in the diff and require human review before acceptance.

Acceptance checks the exact reviewed content, scoped edit grant, document
identity/revision and host ownership. It holds autosave, then rechecks after
that await. It applies once through editor-core, origin `ai`, unique history
group `ai:<run>:<proposal>`. Repeating acceptance is idempotent. Rejecting,
cancelling generation or a failed validation never changes canonical buffers.
The result remains dirty and is not saved; existing explicit Save writes it.

`Undo AI transaction` checks that the accepted origin group is still the
history head. If a user or collaborator edited afterward it refuses without
changing anything. Users may undo later edits first or request a new restoration
preview. We do not claim selective collaborative undo. Guest acceptance and
native AI undo are denied, including after an asynchronous autosave hold.

## Deliberate limits

- This is a Code vertical slice. Photo is classified but has no shared adapter
  or AI edit controls yet. Next: non-destructive adjustment stack transactions,
  actual canvas before/after and adapter conformance tests.
- Single-document acceptance only. No partial dependency-group or multi-document
  atomicity claims, disk exports, shell, publishing, paid media or auto-apply.
- IDs and acceptance receipts are in-memory. Restart discards proposals rather
  than restoring an uncertain pending acceptance. IDs are not persisted on disk.
- The proposal gateway stores immutable complete text in memory, not a
  cryptographic content-addressed asset store.
- HTML parser validation does not prove accessibility or rendering equivalence.
  Production Windows/Tauri, real providers and a two-device collab session still
  need integration testing before a release.

## Verification

Run from `phase1`:

```sh
npm ci
npm run typecheck
npm run build
npm run test:core
npx playwright install chromium
npx playwright test tests/ai-core.spec.ts tests/agent-panel.spec.ts tests/agent-autosave.spec.ts --workers=1
```

Unit cases cover identity/rename/reopen, scoped bounded context, separate
permissions/destinations, no external-effect grant, accept/reject/idempotency,
origin undo, same-text stale revisions, metadata locks, async races, guest roles,
later remote edits, parallel acceptance and unsupported tools.

Browser tests use deterministic transport fixtures, not real credentials or
billable inference. They check actual provider request scope, source selection,
complete preview, sandbox rendering, accept/undo, dirty state, rejection,
concurrent user changes, guest refusal, cancellation/streaming, cloud denial,
and native autosave hold through explicit Save. Screenshots are generated under
`tests/artifacts`; tests have no machine-specific download paths.
