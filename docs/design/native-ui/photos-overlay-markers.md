# Photos overlay markers — click to delete a dab or heal spot (P50)

Twelfth functional photo-studio feature phase: the painted regions
become editable objects. Every committed dodge dab and every committed
heal spot gets a marker on the canvas overlay; clicking a marker
deletes exactly that one adjustment as a single settings commit —
one undo step. This is the retouch equivalent of selecting and
deleting a single brush stroke instead of undoing a whole chain.

## What changed

- `PhotosWorkspace.tsx`: a shared `markerProps(i,kind)` helper gives
  every marker pointer events (the overlay SVGs themselves stay
  pointer-transparent so painting between markers is unaffected),
  `cursor:pointer`, `role="button"`, the new aria-label
  `photos.overlay.remove`, a per-index test id, and a click handler
  that stops propagation (the stage never starts a pan/stroke from a
  marker press) and commits the deletion:
  `removeDab(i)`/`removeSpot(i)` filter exactly one entry out of
  `now.dabs`/`now.spots` — one commit each, so one undo restores it.
- Dodge mode: the committed-dab circles of the existing mask overlay
  (P48) become clickable markers; the in-flight stroke preview stays
  non-interactive.
- Heal mode: a new `photos-heal-overlay` renders every committed spot
  as a subtle white target ring (thin ring plus center dot, no fill)
  — deliberately quieter than the accent dodge markers and visually
  distinct from the dashed in-flight source indicator.
- Markers only render in their own active mode and never in crop
  mode; the canvas backing store is untouched (overlay SVGs only).
- i18n: `photos.overlay.remove` in all five locales.

## Honesty / scope notes

- Deletion is a real settings commit through `commitPhotoSettings`:
  undo history, dirty tracking and the session signature treat it like
  any other edit, and the healed/dodged source is re-encoded the same
  way as on any settings change.
- Trade-off, accepted in the approved scope: a marker eats the press,
  so painting a new dab/spot exactly on top of an existing marker is
  not possible — clicking there deletes the old one first.

## Tests

- Gallery `?view=photos-dodge`: two dabs painted, the first marker
  clicked — exactly one dab remains, its pixels return to base while
  the other dab stays dodged; ONE undo restores both dabs and the
  byte-identical bitmap.
- Gallery `?view=photos-heal`: an auto-source click on the defect
  plus one on clean green renders two rings; clicking the defect ring
  brings the defect back (remaining green-onto-green spot leaves the
  frame pristine); ONE undo restores both spots.
- Canvas bitmaps byte-identical to the P49 base (e57eb867) in light
  and dark for both modes — markers are pure overlay, never canvas.
