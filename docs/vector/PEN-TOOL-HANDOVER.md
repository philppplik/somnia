# Wave 4 Pen tool handover

Base: somnia-agent at 427f8dbd2478d361b544a8cf81c4fd9dc0b7b631.
Feature branch: feature/vector-pen-ui. No remote changes, push, PR or CI trigger.

## Changes

- `phase1/src/components/vectoredit/PenToolEditor.tsx`: controlled SVG pen/node surface.
- `model.ts`: explicit vectorcore-compatible boundary and pure immutable preview helpers.
- `index.ts`: public component/types/helpers exports.
- `phase1/src/components/imageedit/VectorPen.test.tsx`: 9 node:test cases under the existing test:core glob.
- `docs/vector/PEN-TOOL-UI.md`: adapter, callbacks, interactions and open work.

Click corner / drag smooth, handle/anchor drag, curve-preserving subdivision insertion, point deletion, marquee, Shift selection, keyboard nudge/type conversion, close/finish, gesture rollback and atomic commits are implemented. Smooth preserves opposite length; Symmetric matches angle and length; Corner retains independent handles. Remove handles is separate. Escape cancels an active gesture or finishes the open path into node mode. Events for editor shortcuts do not bubble to application shortcuts.

Chrome pointer capture retargets dblclick to the SVG rather than segment; insertion explicitly re-hit-tests the element at the screen position. This was found by browser testing and fixed.

## Verification, October 7, 2026

- `npm run typecheck`: pass.
- `npm run build`: pass; existing large-chunk/dynamic-import warnings remain.
- `npm run test:core`: 1205 tests, 1202 pass, 3 skip, 0 fail.
- Focused tests: 9/9 pass.
- Real Chromium gesture smoke: corner click, smooth drag, path close, anchor move, keyboard nudge, corner/smooth conversion, Alt handle drag, double-click insertion, Escape rollback with no extra commit, marquee all, delete all, Enter/Escape finish and fresh paths; no page errors.
- Actual screenshot inspected: full editor, readable toolbar/help, selected mode, closed curve, inserted anchor and visible handle lines/circles. Screenshot attached separately.

## Integration and honest open list

1. Mount in the host and connect vectorcore serialization, styles, preview and undo. No main/dialog integration in this branch.
2. Main reports that vectorcore fulfills the structural document contract exactly. Core move-handle defaults to mirroring; the UI's smooth means angle-only with preserved length and symmetric means angle+length. Preserve this explicit distinction when adapting core operations, rather than mapping both to its default. Helpers currently compute snapshots independently and do not require core move-handle.
3. Object selection, continuation from endpoints, draft-only handling for single-node paths and second Escape exit are not implemented. Single-node paths remain in the model; the host decides persistence/export.
4. English text only; add i18n keys. No added dependencies or paid APIs.
5. No snapping, zoom/pan, object transforms or fill/stroke controls. Anchor/handle marker radii are document units; zoom scale policy remains open.
6. Keyboard operates at canvas level; no separate node tab order or accessible coordinate editor.
7. Imported documents require validation and unique IDs. Remount when switching documents during a gesture. No async/concurrent document replacement policy.
8. No Penpot or other MPL code copied. Implementation is independent TypeScript.

Apply the format patch with `git am`, or fetch the feature branch from the accompanying git bundle and cherry-pick its commit. Both artifacts contain the same commit. The central builder owns integration.
