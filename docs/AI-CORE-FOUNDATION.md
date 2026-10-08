# ADR: native AI document boundary, phase 1

Status: rebased and reworked as a local git-am patch series against
`d91046f` (original Phase 1/2 baseline: `5c1199c`). No release, publication or repository push is part of this work.

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

- Phase 1 is the Code vertical slice; Phase 2 below adds bounded Photo editing.
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

## Phase 2: bounded Photo vertical slice

Implemented as a follow-on local patch series on top of phase 1. Open PNG/JPEG
media tabs can now be the pinned AI document. The shared registry carries the
serialized non-destructive image operation stack, never a base64 image or file
URL. Source pixels remain in the mounted inline RasterEditor resource owner. There is no image
understanding or cloud vision claim: a text model sees only source dimensions,
format and operation metadata and follows the user's described intent.

`photo-stack-v1` uses the existing raster engine and CPU reference renderer.
The capability list contains only:

- `raster_inspect`: metadata and operation stack, no pixels.
- `raster_adjust`: append a validated brightness/contrast/saturation/hue/
  temperature/highlights/shadows adjustment.
- `raster_filter`: append one of the six existing raster filters with strength.
- `raster_crop`: append a bounded integer-pixel crop.

No generation, layer/mask UI, resize tool or operation is advertised merely
because a concept names it. Source and output are capped at 4 megapixels in this
synchronous-preview slice, and the stack at 100 operations. Larger original
assets remain viewable but cannot use these AI tools. Every operation is
validated and rendered locally before a review card exists. The before/after
images are actual CPU reference output, with exact dimensions and the operation
parameters visible. Source alpha is preserved by the existing CPU handlers.
Color-profile preservation is not claimed beyond the browser's image decoding
and canvas behavior.

Accept uses the same policy/transaction manager as Code. `photoWorkspace` is
now a port into the real `RasterEditorProvider`, not an independent decoder,
preview URL or history. It reads the current native op stack plus committed
adjust/filter controls from `appStore.rasterDoc`. Accept appends the AI operation
in rendering order, freezes existing controls into the stack, resets the live
controls to neutral and commits exactly one real RasterEditor history step.
The actual viewport renders that state. Editor Undo/Redo and history share the
same transaction as AI Undo. AI Undo additionally checks origin, source identity,
history head and snapshot, refusing later manual/AI edits. Media source bytes,
text buffers and disk remain unchanged. Reject and stale-source conflicts do
not mutate. Tab switching keeps the original document pinned.

A2 retained layers/masks use a separate worker `LayerSession`. Its current API
has no adjustment/filter/crop operation with full retained-state undo. The AI
adapter refuses these documents before provider inference; it does not flatten,
lose masks, or offer fake per-layer controls. Active pixel selections are also
refused, because these tools are whole-image and do not implement selection-
scoped adjustment/crop. Deselect explicitly to use whole-image tools. Existing
selection-cut/fill operations are not yet in the bounded adapter whitelist and
are refused rather than mis-rendered. Existing supported transforms, adjust and
filters are retained and previewed through the editor's real registry. PNG/JPEG
and opened WebP use this port; PSD/SVG/PDF do not gain Photo AI editing.

A real `Save Photo copy as PNG` action exports CPU-rendered output through the
existing image host's save-copy dialog/download. It never calls overwrite.
This is a separate explicit effect, not part of accepting AI. Native save
success is confirmed by the host; a web download indicates export was started,
not verification of the user's final filesystem. Dirty Photo tabs prompt before
close, replacement or clear; cancelling preserves their edits. A beforeunload
warning covers browser exit. Session stacks are not persisted after restart,
and OS termination is not a durable recovery mechanism. Photo project-close
cancellation also preserves the text project and its draft; collaboration
adoption stops when Photo discard is declined.

Collaboration guests cannot accept or undo. Host-local Photo acceptance does
not broadcast operation-stack edits to collaborators; there is no shared
raster-document CRDT or selective Photo collaboration undo in this phase.
Exported pixels can later be opened/shared through existing file workflows.

Tests additionally cover local-only provider metadata, real grayscale pixels
and preserved alpha, exact crop size, reject/undo, source replacement conflict,
unknown tools/ops, parameter bounds, PNG download, and cancelling dirty close.
Actual preview and accepted-Photo pixels were visually inspected. Tests use
relative artifact paths and no hard-coded workspace download directories.
Tests also cover manual slider preservation, native Undo/Redo, manual edit
conflicts, retained-layer refusal and real active-selection refusal.

## Rework verification on d91046f

- PhotoCraft bridge built locally with Rust 1.95.0, wasm32-unknown-unknown,
  wasm-bindgen-cli 0.2.129. Generated JS/WASM are not committed in this series.
- `npx tsc --noEmit` and `npm run build`: pass. Existing Vite dynamic-import
  warnings remain; no production native Windows build/signing was attempted.
- Full `test:core` file list, isolated with Node `--test-concurrency=4`:
  1,598 tests, 1,554 pass, zero failures, 18 skipped, 26 TODO. The skip/TODO
  inventory is inherited. Earlier concurrent/stress runs hit an untouched
  collab unread timeout and math delimiter timing assertion; isolated reruns
  of both files and the final full suite pass. No timing assertions were weakened.
- Browser fixtures run with local system Chrome (temporary runner config,
  not committed): nine Photo cases pass, five AI Core cases, eleven existing
  Agent/Autosave cases, and seven Media/Folder/History cases pass in batches.
  The folder command test now clicks the visible Commands button instead of
  racing shortcut readiness. All generated assets use repo-relative paths.
- Visually inspected `tests/artifacts/ai-photo-preview.png` and
  `ai-photo-accepted.png`: the actual inline RasterEditor remains red/blue
  during review; before/after review shows the grayscale output. After Accept
  the actual viewport is grayscale with a dirty tab and native Undo enabled.
  The PNG-copy control is compact and has an explicit accessible label/tooltip.
  The test also samples accepted viewport pixels rather than trusting state only.
- Real providers, Windows/Tauri host dialogs, native file-write completion,
  large tiled images, layer/mask editing and shared raster collaboration remain
  outside this verification. This is a patch delivery, not a stable release.
