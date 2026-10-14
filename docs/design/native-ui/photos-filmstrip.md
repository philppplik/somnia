# Photos filmstrip (P40)

Seventh functional photo-studio feature phase. A Lightroom-style
filmstrip below the workspace bar: one thumbnail per developable photo
in library order, single-click switching — the visual triage companion
to the P38 prev/next navigation.

## What changed

- `src/lib/photos/photoNav.ts`: the developable-only library filter is
  now exported as `developablePhotos(items)` (generic over the item
  shape, so media items keep their `url`); `photoNav` reuses it. No
  behaviour change; existing nav tests untouched and passing.
- `PhotosFilmstrip` (new component): rendered at the bottom of the
  workspace when at least two developable photos exist. Each photo is a
  DS `Button` (compact, outline) wrapping an `img` fed directly from
  `MediaItem.url` — no decode work, no copies. The active photo's
  button is `aria-pressed` (DS pressed styling) and is scrolled into
  view on change; clicking calls `setActiveMedia`, the same mechanism
  the studio shell and the P38 nav use. Hidden for zero or one photo.
- `bento.css`: `.canvas-stage>.photos-filmstrip{margin-inline:0;width:100%}`
  — the global `.canvas-stage>div{margin-inline:auto}` rule otherwise
  shrink-centres the strip; this mirrors the existing `.media-bar`
  override next to it.
- i18n: `photos.filmstrip.aria` in all five photo locales
  (en, de, es, fr, pt-BR).

## Coverage

- Unit: `src/lib/photos/filmstrip.test.ts` (3 tests: library order with
  psd/webp/non-image skipped, empty list, generic item shape preserved).
  All existing photos tests unmodified and passing (105 tests including
  P34-P39 additions).
- Browser: `test/design-system/photos-filmstrip.spec.ts` drives a real
  workspace fed by the media store like `PhotosCanvas` via the
  `?view=photos-filmstrip` gallery route. The proof adds three real PNG
  photos (canvas-encoded gradients) and a hue-deterministic fake engine
  keyed by source bytes, so stage and thumbnails always agree: strip
  lists all three, first is pressed, clicking switches name/position
  (2 / 3, 3 / 3); light/dark production-style screenshots on the second
  photo (`test-results/ds-photos-filmstrip-{light,dark}.png`).
- Pixel parity: the canvas bitmap is captured via `toDataURL` (exact
  pixels, no screenshot rounding) at "Actual size" zoom in both trees;
  base-tree run (tip `316cd01b` + proof/route/spec only) and feature
  tree produce byte-identical 240x150 PNGs in both themes — the feature
  adds only the strip below the bar.
- No new raw controls (thumbnails are the DS `Button`); ratchets
  unchanged. Actual app photos E2E remains CI-only.

## Filmstrip sort (P73)

The filmstrip sorts its thumbnails now: a second `NativeSelect` next to
the rating filter offers Library (default), Rating (descending) and Flag
(picks first, rejects last), persisted via `panelStateStore` under
`photos.filmstripSort`.

- `src/lib/photos/filmstripSort.ts`: `sortFilmstrip(photos, sort,
  ratings, flags)` — stable sorts (JS `Array.sort` keeps library order
  inside each rating/flag group), never mutates the input. Sorting is
  display-only: the workspace prev/next navigation and the position
  readout keep library order on purpose.
- `PhotosFilmstrip`: filter first, then sort; the select reuses the
  filmstrip's compact styling; labels `photos.filmstrip.sort(.library|
  .rating|.flag)` in all five photo locales.

Coverage: `filmstripSort.test.ts` (4 tests: default order, rating
descending with tie stability, flag ranking, no input mutation);
`photos-filmstrip.spec.ts` gains a light/dark leg that rates two photos
from the keyboard, sorts by rating, asserts the DOM order both ways and
screenshots the sorted strip.

## Multi-select and batch apply (P81)

The filmstrip selects multiple photos now: plain click stays
single-select + activate, Ctrl/Cmd-click toggles one thumbnail,
Shift-click selects the anchor..target range in strip order (the
Lightroom convention). Selected thumbnails get an accent ring and
`data-selected`; selection and anchor persist via `panelStateStore`
(`photos.filmstripSelection` / `photos.filmstripAnchor`).

With two or more selected, an "Apply to N photos" button appears in the
strip: it copies the active photo's develop look (`extractLook`, no
geometry) onto every selected photo through the existing
`syncLookToPhotos` batch path — one settings commit per photo, a failed
photo never aborts the run, and a note reports "applied / failed" when
done. The button is disabled while the active photo is neutral.

- `src/lib/photos/selection.ts`: pure `toggleSelect` / `rangeSelect`
  helpers (range both directions, unknown anchor or target falls back
  to the target alone).

Coverage: `selection.test.ts` (3 tests); `photos-filmstrip.spec.ts`
gains a light/dark leg that ctrl-selects two photos, applies a warm
exposure from the active one, reads the target session's exposure back
(1.2 applied, the unselected one still 0), then shift-selects the full
range (button count 3) and collapses back with a plain click.

## Batch culling on the selection (P82)

The rating (0-5) and flag (P/X/U) keys now act on every selected photo
when the filmstrip selection has more than one entry, and on the active
photo otherwise — the culling workflow this side of Lightroom's survey
mode. The targets come from the persisted `photos.filmstripSelection`
panel state, so keys and clicks never disagree about what is selected.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
ctrl-selects two photos, rates them 4 (badges on both, the unselected
one unrated), rejects them with X (flag badges), then clears flags and
ratings with U and 0.

## Batch preset on the selection (P83)

Next to the "apply current look" button, a preset picker appears
whenever the selection has two or more photos: all built-in presets
plus the user's own (read from the same `photos.presets.user` panel
state as the Presets panel). Choosing one applies that look to every
selected photo through the same `syncLookToPhotos` batch path, reports
applied/failed in the note, and the picker resets to its placeholder
for the next run.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
selects two photos, applies the b/w preset, reads `saturation: -100`
back from both sessions, verifies the unselected photo stayed neutral
and the picker reset.

## Auto-advance (P84)

A filmstrip toggle (`photos.autoAdvance`, SkipForward icon) turns on
Lightroom-style auto advance: after a rating or flag key lands on the
active photo — single selection only, multi-select batches stay put —
the workspace moves to the next photo in library order. On the last
photo it simply stays.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
enables the toggle, rates (badge on the first photo, active moves to
the second), flags (moves to the third), hits the end without moving,
proves multi-select batches don't advance, and disables the toggle.

## Survey mode (P85)

With two or more photos selected, a grid button (LayoutGrid) opens a
survey overlay over the workspace: one cell per selected photo with its
developed frame painted on a canvas (sessions open on demand via
`ensurePhotoReady`, a photo that fails to open stays blank), its name
underneath. Clicking a cell activates that photo and closes the survey;
Escape and the close button close it without switching.

- `src/components/photos/PhotosSurvey.tsx`: the overlay; frames paint
  through a scratch canvas scaled into the 320x200 cell canvas. Cells
  are DS `Button`s, so the raw-control ratchet stays flat.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that opens
the survey on a two-photo selection, asserts the count and that the
unselected photo is absent, pixel-proofs both cell canvases, picks one
(active switches, overlay closes), reopens and closes with Escape.

## Remove rejected (P87)

The culling loop closes: once any photo carries a reject flag, a trash
button in the filmstrip offers to remove all rejected photos from the
library. The first click only arms it (the label switches to a confirm
question); the second click runs `closeMedia` per photo, which revokes
the object URLs and closes the photo sessions through the media cleanup
hook, drops them from the selection, and activates the first remaining
developable photo (or none).

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
rejects the middle photo, arms the button (photo still there,
confirm-state screenshot), executes (thumbnail gone, position readout
"/ 2", button disappears with no rejects left).

## Culling inside the survey (P89)

Each survey cell now carries the same culling controls as the
filmstrip: a five-star rating row and pick/reject flag buttons below
the name, writing to the same `ratings`/`flags` stores as the
filmstrip, so the badges on the strip update live while the survey is
open. Picking a photo moved from the whole cell to the canvas itself
(a ghost `Button` with a per-photo test id), keeping one click to
activate and close.

Coverage: the survey leg in `photos-filmstrip.spec.ts` now clicks the
new pick target and additionally rates a photo inside the survey
(filmstrip badge shows the rating) and cycles a reject flag back to
off. Because ratings persist across the light/dark legs, the leg first
resets the photo's rating through the `ratings` store before clicking.

## Copy/paste settings and unrated filter (P90)

Two buttons next to the batch apply copy the active photo's look
(`extractLook`) into a persisted panel-state clipboard and paste it
onto any other photo as one undo step (`commitPhotoSettings` +
`applyLook`). Copy is disabled while the active photo is neutral, paste
while the clipboard is empty. The rating filter gains an "unrated"
option that shows exactly the photos with no stars yet.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
filters to unrated (a fresh rating removes the photo from the view),
copies a warm white balance from one photo and pastes it onto the
next, asserting the pasted value through the photo session.
