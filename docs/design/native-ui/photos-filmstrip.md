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

## Paste onto the selection, WB presets in the dropdown (P91)

With several photos selected, paste no longer targets only the active
photo: the copied look goes through `syncLookToPhotos` onto every
selected photo, with the usual apply note; a single photo still gets
one undo step. The filmstrip preset dropdown also lists the named
white-balance presets (tungsten through flash) between the built-in
looks and the user presets, applying temp/tint to the selection.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
copies a warm white balance, pastes it onto a two-photo selection
(both sessions updated, note visible) and applies the cloudy WB preset
from the dropdown (temp/tint land on the photo).

## Selection helpers (P92)

A compact "Selection" dropdown in the filmstrip selects every photo
in the current filter view, selects only the unrated ones, or clears
the selection - the fast path into batch rating, batch apply and the
survey without modifier clicks.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
rates one photo, selects unrated (two photos), selects all (three),
and clears the selection.

## Color labels (P93)

A third culling axis next to stars and flags: red/yellow/green/blue
color labels per photo in a persisted `labels` store. A Label dropdown
in the filmstrip labels the whole selection (or the active photo) and
clears labels again; each labeled thumbnail gets a colored dot in the
corner (colors live in `bento.css` as rgb values, keeping the hex
ratchet flat), and the filter dropdown lists the four labels.

Coverage: `labels.test.ts` covers set/cycle/clear and invalid input;
`photos-filmstrip.spec.ts` gains a light/dark leg that labels a
two-photo selection, filters to red (the unlabeled photo leaves the
view) and clears the labels again.

## Library grid (P94)

The survey button is always visible now: with two or more photos
selected it surveys the selection as before, otherwise it opens the
whole filtered view as a browse grid - every cell keeps its culling
controls and shows the photo's color label dot. Picking a cell
activates that photo and closes the grid.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
opens the grid with no selection (all three photos present, label dot
on the labeled cell) and picks a photo from the grid.

## Live grid filters (P95)

The filter/sort logic moved into a shared `useVisiblePhotos` hook
(filmstrip and grid read the same panel state). The library grid's
header now carries the same filter and sort dropdowns; in grid mode
the cells follow both live, and because the state is shared the
filmstrip shows the same filter when the grid closes. A survey opened
on a selection stays a fixed set.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
opens the grid, filters to red-labeled photos (the other cells
disappear), picks one and finds the filmstrip filter set to the same
value.

## Selection from the grid (P96)

Each grid cell has a corner toggle that adds or removes the photo
from the filmstrip selection (`toggleSelect`, pressed state shown);
the header counts the selected photos. Closing the grid keeps the
selection, so batch paste/apply/survey work straight from browsing.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
toggles two photos in the grid (pressed, count visible) and finds the
filmstrip's apply button offering the two-photo batch after closing.

## Keyword tags (P97)

A third organization layer: free-form keyword tags per photo in a
persisted `tags` store (trimmed, deduped, capped at 20 per photo). A
comma-separated tag input in the filmstrip edits the active photo's
tags (replace) or, with a selection, merges the typed tags onto every
selected photo. Tagged thumbnails get a chip with the first tag and
an overflow count, and the filter dropdown lists every tag in the
library as a dynamic option.

Coverage: `tags.test.ts` covers set/merge/clear, invalid input, the
cap and the sorted union; `photos-filmstrip.spec.ts` gains a
light/dark leg that batch-tags two photos (badges on both), filters
to the new dynamic tag option and clears again.

## Library search (P98)

A search field in the filmstrip narrows the strip (and, through the
shared `useVisiblePhotos` state, the grid) by substring match on the
photo name or any of its tags, case-insensitively; empty shows
everything again. The query persists in the panel state.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
searches a name in caps, then a tag (each hides the other photos),
and clears back to the full strip.

## Collections (P99)

Saved filter sets: the current filter, sort and search become a named
collection (persisted in the panel state). A dropdown applies a set -
all three controls jump back - and while the current state exactly
matches a saved set, a delete button offers to drop it. Because the
grid reads the same shared state, applying a collection reshapes the
grid too.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
saves a search as a collection, clears, applies the set (search
restored, other photos hidden) and deletes it again.

## Stacks (P100)

Bursts and series group into stacks: a persisted `stacks` store maps
photos to stack ids, "Group into stack" pulls the selection into one
stack (joining a member's existing stack), "Ungroup" drops it. A
collapsed stack shows its first visible photo with a member count and
a chevron that expands the members inline (and back). Grouping
follows the visible strip order, so a stack whose members are split
by a sort shows its consecutive runs.

Coverage: `stacks.test.ts` covers group/join/ungroup and the
strip-row grouping helper; `photos-filmstrip.spec.ts` gains a
light/dark leg that groups three photos (cover + count), expands and
collapses inline, and ungroups again.

## Auto-stack (P101)

One click stacks every detected burst: `detectSeries` finds photos
whose names share a prefix and differ only in a trailing, consecutive
number (IMG_1234..IMG_1237), extension- and order-agnostic, and feeds
each series into the stacks store. The button appears only when a
series exists; the apply note reports how many were stacked.

Coverage: `autoStack.test.ts` covers runs, gaps, prefixes, padded
numbers and ignored singles; `photos-filmstrip.spec.ts` gains a
light/dark leg that auto-stacks the three-photo fixture (note,
collapsed count) and ungroups again.

## Smart filter and the grouped strip menu (P102)

The smart filter combines four rules with AND: minimum rating, flag
(pick/reject), color label and an exact keyword tag. It lives in
`useVisiblePhotos` (persisted as `photos.smartFilter`), so the library
grid follows it like every other filter dimension, and while it is on
the legacy single filter select is disabled.

To keep the strip lean, the smart rules do not get their own toolbar
row: one "Menu" button (`photos-filmstrip-menu`) opens a grouped
popover (`menu-popup`, opens upward) with three sections - smart
filter, collections, stacks (group/ungroup/auto-stack). Those stack
and collection controls moved out of the toolbar into the menu; the
toolbar keeps search, the single filter, sort and the selection
helpers. While the menu is open the strip drops `overflow-x-auto` so
the popover is not clipped; Escape closes it. New i18n key
`photos.menu` in all five photo locales.

Coverage: the P99/P100/P101 gallery legs open the menu before using
their controls; a new light/dark leg rates and flags the fixture
photos, turns the smart filter on with two rules (rating >= 2, flag
pick) and asserts only the photo passing both survives, then toggles
it off again (open-menu screenshots
`test-results/ds-photos-smart-menu-{light,dark}.png`).

## Stack survey and cover choice (P103)

A burst's best shot becomes the cover: the menu's stacks section opens
the survey with exactly the active stack's members (visible order) -
compare them side by side, click the winner - and a "Make cover"
button persists that member as the stack's cover. The collapsed strip
row then shows the chosen cover with the member count; the default
stays the first visible member. Covers persist in their own
localStorage key and die with their stack on ungroup.
`groupForStrip` takes an optional covers map (existing three-arg
calls unchanged).

Coverage: `stacks.test.ts` covers set/get, non-member rejection, the
cover leading the collapsed row and the ungroup cleanup;
`photos-filmstrip.spec.ts` gains a light/dark leg that stacks the
fixture series, surveys the members, picks strip-2, makes it the
cover (count badge moves, old cover back inside) and ungroups again
(`test-results/ds-photos-stack-survey-{light,dark}.png`).

## Collections carry the smart filter (P104)

A saved view is complete now: collections (P99) persist the smart
filter (P102) alongside filter, sort and search. Applying a
collection restores all four smart rules plus the on switch; the
delete button appears only while the whole state - including every
smart rule - matches a saved set. Sets saved before P104 have no
smart entry and apply with the smart filter off.

Coverage: `photos-filmstrip.spec.ts` gains a light/dark leg that
rates the fixture photos, saves a "three stars and up" view, turns
the smart filter off (everything visible), applies the collection
(smart back on with its rule, strip narrowed again) and deletes it
(`test-results/ds-photos-smart-collection-{light,dark}.png`).

## Culling completion: stack cull, hide-not-delete, ohne rules (P105)

One click finishes a burst: "Pick cover, reject rest" (stacks
section of the strip menu) flags the chosen cover (P103) as pick and
every other member as reject - plain flags, fully reversible.

"Remove rejects" now hides instead of closing: rejects leave the
library view (strip, grid and the nav/position via `photoNav`) but
the media items stay open in the app - original files are never
deleted. The two-click armed confirm stays; the undo path is
"Restore hidden" in the strip menu, visible while anything is
hidden (`src/lib/photos/hidden.ts`, persisted).

The smart filter gains "ohne" rules: the flag rule offers Unflagged
and the label rule No label - the missing culling query "unflagged
and two stars or better".

Coverage: `hidden.test.ts` covers hide/dedupe/restore and the
photoNav skip; the remove-rejects gallery leg gains hidden resets
(same assertions otherwise); two new legs: the ohne rules narrow the
strip as expected, and the cull leg goes stack -> cull -> expanded
flag badges -> remove (hidden, position shrinks) -> restore (stack
whole again, cover kept)
(`test-results/ds-photos-smart-none-{light,dark}.png`,
`ds-photos-stack-cull-{light,dark}.png`).

## Hidden review loop (P106)

Hiding (P105) gets its review path: "Show hidden" in the strip menu
dims hidden photos back into the strip with an eye-off marker
(persisted `photos.showHidden`). Clicking a marked thumb activates
it and "Restore active" brings just it back; "Restore hidden" still
restores everything. `hidden.ts` gains `unhidePhotos(names)`; the
strip stays mounted while hidden photos exist so the menu (and with
it the undo) is always reachable.

Coverage: `hidden.test.ts` covers the partial unhide; the new
light/dark leg hides one photo, reviews it (dimmed + marker),
restores it alone, hides two, screenshots the review mode and
restores all (`test-results/ds-photos-hidden-review-{light,dark}.png`).

## Virtual copies (P107)

"Virtual copy" in the strip menu duplicates the active photo as its
own strip entry '<name> (Kopie N).<ext>' (localized word): same
bytes, the source's current develop settings (via the settings
clipboard encode + commit), but its own session, rating, flags,
labels, tags and stack membership - every per-photo store keys by
name, so copies are independent for free. The closing paren keeps
copies out of `detectSeries` burst detection. Originals are never
touched; removing a copy from the library view uses the P105
hide/undo path.

Coverage: `virtualCopy.test.ts` covers naming (counter, taken
names, extensions, localized word); the light/dark gallery leg
rates the source, creates a copy (own entry, active, library count
grows, source rating kept, copy unrated), rates the copy
independently (`test-results/ds-photos-virtual-copy-{light,dark}.png`).

## Snapshots (P108)

"Save snapshot" in the strip menu freezes the active photo's current
develop settings under a name (per-photo, persisted locally,
validated on read via the settings-payload codec). Each snapshot
shows as a grouped menu row: clicking the name applies it through
`commitPhotoSettings` (undoable via history), the trash button
deletes it. Saving with an existing name overwrites. Originals are
never touched; snapshots live next to virtual copies - a copy forks
the photo, a snapshot forks its settings timeline.

Coverage: `snapshots.test.ts` covers save/read-back/rename/delete
and the stable-name-array contract for `useSyncExternalStore`; the
light/dark gallery leg saves a snapshot, moves the settings,
applies it back and deletes the row
(`test-results/ds-photos-snapshots-{light,dark}.png`).

## Manual collections (P109)

"Add to collection" in the strip menu files the active photo (or the
selection) under a name; the collection select above it applies the
collection as a library filter - the grid follows for free because
`useVisiblePhotos` owns the filter dimension (panel state
`photos.collection`). With a collection applied, "Remove photo"
takes the active photo out and "Delete collection" drops the whole
group and clears the filter. Members keep insertion order, names
are unique; persisted locally, originals are never touched.

Coverage: `collections.test.ts` covers add/dedupe/remove/rename/
delete and the stable-array contract; the light/dark gallery leg
adds the active photo to a new collection, checks the strip narrows
to members only, then deletes the collection
(`test-results/ds-photos-collections-{light,dark}.png`).

## Compare with reference (P110)

"Set as reference" in the strip menu pins the active photo as the
comparison anchor (panel state `photos.reference`, persisted). With
another photo active, "Compare with reference" opens the existing
survey surface with exactly the pair - no new UI area; "Clear
reference" drops the anchor. Read-only view: originals and settings
are untouched.

Coverage: the light/dark gallery leg pins strip-1, activates
strip-2, opens the pair survey and clears the reference
(`test-results/ds-photos-compare-{light,dark}.png`).

## Quick develop (P111)

The daily two in one grouped menu row: "Settings from previous
photo" is Lightroom's Previous button - the last active photo is
tracked module-level (`lastActiveName`, survives the workspace
remount) in panel state `photos.previousPhoto`, and one click
commits its develop settings onto the active photo. "Rotate 90°
left/right" turns the orientation setting by a quarter turn. Both
go through `commitPhotoSettings` (undoable), originals untouched.

Coverage: the light/dark gallery leg styles strip-1, activates
strip-2, pastes (temp jumps), rotates right (orientation 1) and
back (`test-results/ds-photos-quick-develop-{light,dark}.png`).

## Before/after split from the strip (P112)

The strip menu carries the before/after split toggle and its
direction button, mirroring the workspace toolbar through the
shared panel state (`photos.split`, `photos.splitDir`) - flip it
while culling without reaching back to the stage. Reuses the
existing `photos.split` labels; view-only, originals untouched.

Coverage: the light/dark gallery leg toggles the split from the
strip, asserts the workspace buttons follow (aria-pressed), flips
the direction and turns it off
(`test-results/ds-photos-split-strip-{light,dark}.png`).

## Photo info (P113)

"Photo info" in the strip menu opens a compact metadata block
inside the menu: dimensions, camera, lens, exposure/aperture/ISO/
focal length, date and file size, read lazily from the file bytes
by a dependency-free mini parser (`exifInfo.ts`: JPEG SOF + APP1
EXIF, PNG IHDR + eXIf, small TIFF reader). Best effort - fields
that are absent just do not render. Read-only.

Coverage: `exifInfo.test.ts` runs a synthetic EXIF JPEG (camera
name dedupe, exposure formatting, rationals) and the PNG/garbage
fall backs; the light/dark gallery leg opens the panel and checks
the dimensions and size lines
(`test-results/ds-photos-info-{light,dark}.png`).
