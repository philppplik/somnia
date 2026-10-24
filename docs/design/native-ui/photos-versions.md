# Photos versions and split polish

Two related pieces around comparing a photo with itself: named versions in
the History panel, and persistence for the before/after split divider.

## Versions (History panel)

The History panel's undo list is linear: jump back and edit, and the redo
future is gone. Versions are the non-linear complement - named snapshots of
one photo's FULL develop settings (crop, rotation and flips included,
unlike presets which are geometry-free looks).

- Save: name + "Save version" stores `encodeSettingsPayload(session.now)`
  under the photo's name in the panel-state store (`photos.versions`).
  Same name replaces (case-insensitive, keeps the id). Cap of 20 per
  photo; past the cap the oldest version ages out.
- Apply: clicking a version runs the `photos.applyVersion` command
  (validated, logged), which decodes the payload through
  `decodeSettingsPayload` (untrusted read, clamps into engine ranges) and
  commits it as ONE undo step - so applying a version is itself undoable.
- The version whose settings render-equal the current settings
  (`photoSignature`) carries `aria-current="step"`.
- Storage follows the panel-state store: versions persist in this
  browser, like presets. The book is keyed by photo name; an emptied
  photo entry is dropped from the book.

## Split polish

The before/after split view (original overlay, draggable divider) already
existed; this slice finishes it:

- Divider position persists in the panel-state store (`photos.splitX`),
  matching the already-persisted split toggle.
- Double-click on the divider re-centers it.
- Escape disarms the split view (shared listener with the targeted
  adjustment disarm; only registered while something is armed).

## Tests and gallery

- `src/lib/photos/versions.test.ts` (4 tests): full-settings round trip
  including geometry, same-name replace keeping the id, cap with oldest
  aging out plus book cleanup on empty, untrusted parse dropping
  malformed entries.
- `photos-versions.spec.ts` against the new `?view=photos-versions` proof
  (real workspace + real History panel, exposure-sign engine): save two
  versions around a history jump, apply the older one non-linearly
  (bitmap matches, `aria-current` set), undo once returns to the jumped
  state, delete works; divider position survives a reload, double-click
  centers, Escape disarms; light/dark captures.
- Cross-worktree parity: `ds-photos-presets-canvas-{light,dark}.png`
  (existing proof, untouched code path) byte-identical to the P55 base
  c0ffdde4 (cmp verified).
