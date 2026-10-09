# Vector Studio quality gates

## Baseline and ownership

The fixture corpus was introduced against beta.5 (`6d9a126`). Vector Studio
core and tools are separate changes. This QA patch owns fixtures, tests and
this document. It does not change runtime APIs, the Studio registry or package
scripts. Its tests are picked up by the existing `src/lib/vectorio/*.test.ts`
core-test glob and the existing Playwright test directory.

## Executable SVG interchange corpus

`phase1/tests/assets/vector-studio/manifest.json` is the shared corpus index.
Accept fixtures exercise blank documents, primitives, cubic/quadratic/smooth
curves and arcs, compound holes, nested transforms, a nonzero viewBox, style
inheritance, dashes, hidden geometry and Unicode/escaped labels. Reject
fixtures exercise scripts, event handlers, external images, references,
foreign objects, gradients, CSS, nested viewports, malformed XML, custom
entities and damaged path commands.

`src/lib/vectorio/studioFixtures.test.ts` checks strict diagnostics, source
preservation, nonmutating export, semantic round trips and importer budgets.
Comparison removes regenerated local IDs, but retains paint order, compound
relationships, geometry, handles, styles, visibility and labels. This is not
an assertion of arbitrary SVG fidelity. Existing vectorio bakes transforms
and viewBox origin into document pixels, elevates quadratics to cubics and
approximates arcs with cubics. Export rounds coordinates to three decimals.

`tests/vector-studio-interchange.spec.ts` checks the same boundary in Chromium,
including absence of attempted fixture network loads or script execution.
It uses a dependency-free Vite harness, without starting the app or requiring
craft WASM. It also renders generated exports through isolated image decoders
and records an image proof. A generated image proof does not validate the Studio UI or
native Windows/macOS/Linux WebViews.

## Studio integration acceptance matrix

| Surface | Required evidence | Contract / state |
| --- | --- | --- |
| Blank start | No file chooser; usable empty artboard; create first shape | `vector-start`, `vector-create-blank`, `vector-canvas`; tested without sample/file chooser |
| Selection | Shape selection, shift multi-select, clear on background | Session regressions pass; real canvas drag/Shift-toggle preserve compounds and holes |
| Transform | Move/scale/rotate once per commit; before remains unchanged | `vector-transform-panel`; `onCommit({before,after,label})` |
| Node editing | Absolute handles; corner/smooth/symmetric edits; invalid coordinates rejected | `vector-node-panel`; `vector-tool-node` |
| Tools | Keyboard focus, selection state, accessible control labels | `vector-tools-panel`; `vector-tool-select` |
| Import | Strict error diagnostics; rejected input keeps current document | `vector-import-svg`; shared corpus |
| Export | SVG download, semantic reimport, overlays excluded | `vector-export-svg`; shared corpus |
| Locked/hidden paths | Cannot accidentally manipulate locked or invisible paths | Hidden selection regression passes; no locked field in the flat path model |
| History | One edit per gesture; undo/redo; new edit invalidates redo | Session undo/redo and redo invalidation tested; pointer cancel/Escape tested in app |
| Exit | Dirty guard; cancelled picker/save does not drop work | Session open/create confirmation and cancellation preserve dirty work; covered by Node and app tests |
| Visual | Artboard, overlays, nodes, panels at normal/high zoom | Actual start/draw/nodes/blank/hole/rejection screenshots inspected in Chromium |

The matrix records unresolved test contracts, not shipped features. No
skipped acceptance tests, success-only stubs or fake implementations are used.
Core/tools APIs and IDs are now grounded in their applied patches. The session
acceptance tests encode the six observed failures and must remain enabled
until fixes pass. There is no locked editor metadata field in this model. SVG is a static interchange format;
editor locks are metadata, not an SVG security mechanism.

## Local commands

Run from `phase1/`:

```sh
npx tsx --test src/lib/vectorio/studioFixtures.test.ts
npx playwright test --config playwright.vector-interchange.config.ts --workers=1
```

Release evidence remains separate: local Chromium is not native acceptance,
and no release CI was triggered by this QA work.

## Recorded local evidence

- 2026-10-09: 23/23 Node corpus tests passed.
- 2026-10-09: 2/2 isolated Chromium boundary tests passed, zero retries.
- Normal app Playwright startup was blocked by missing generated craft WASM in
  the fresh checkout. The isolated run is not a substitute for that gate.

## Integrated app evidence and known failures

Applied core/tools and starter/blank prerequisites in the private QA checkout.
The existing direct-Vite `pw.local.config.ts` can exercise Vector without
generated craft WASM. Four core-author app tests and four QA app tests passed
with no retries. QA checks real empty start without a file chooser, strict
panel-import failure with existing document/history preserved, Escape and
pointer-cancel without commits, and a real PNG download with expected size,
purple RGBA pixels and transparent compound-hole pixels. Inspected screenshots
show the blank artboard, readable error, retained primitives, compound hole
at 330% zoom and working node overlays. This is not production/native evidence.

`src/lib/vectorstudio/acceptance.test.ts`: 26 tests, 20 pass, six fail against
the original core patch. Failures pin compound-aware selection, hole hit
testing, append identity isolation, duplicate compound integrity, exclusion
of hidden paths from selection and rejection of nonfinite node edits. All six now pass after the integrity fix, with the acceptance tests unchanged.

The session's open/create APIs now confirm replacement of dirty work. Cancellation
keeps the document, name, selection and undo/redo history. Vector's independent
name and dirty state are shown in the global status without changing Code state.
New Node and app tests cover these separate integration fixes. No unsupported locked metadata
feature is claimed. The tools tests also need their nested glob in `test:core`
at integration; it was added only to the private checkout for validation.

## Integrity-fix validation (2026-10-09)

- Before: 74 core/tools/session/fixture tests, 68 pass and the six pinned acceptance failures reproduced.
- After: 139 tests pass across vectorstudio (including 10 additional integrity regressions), tools, vectorio, vectorcore and the previous node editor.
- Chromium: existing four core app tests passed; QA app suite plus two integrity tests passed 6/6, including actual compound drag, Shift-deselect and dirty-replacement/status behavior. The isolated interchange suite passed 2/2.
- Production `npm run build` passed after loading the supplied generated WASM packages. No push, merge, release or CI run was performed.
- Full repository `test:core` exceeded the 120-second execution limit after at least 1605 passing tests, with no reported failure before termination. This is an incomplete gate, not a full-suite pass.
- Inspected actual blank, rejected-import and moved-compound-hole screenshots: readable panels, intact hole and current Vector name/dirty status. Native desktop acceptance remains separate.
