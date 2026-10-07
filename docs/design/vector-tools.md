# Vector tools: UI and UX design

Status: design only. No code in `phase1/src` implements this yet.
Base: branch `somnia-agent` at `427f8db`. Author branch: `docs/vector-tools-ux`.
Companion files, all in this folder:

- `vector-tools.tokens.json` - new design tokens (light and dark) plus the contrast pairs that are tested.
- `vector-tools-i18n.json` - proposed strings for en, de, es, fr, pt-BR.
- `vector-tools-shortcuts.json` - proposed shortcuts.
- Test: `phase1/src/lib/vectorToolsDesign.test.ts` (run with `npm run test:core`).

## 1. Goals and non-goals

Goals

1. Let a user draw and edit SVG shapes on the Somnia canvas without leaving the bento layout.
2. Keep canvas and code in sync the way the rest of Somnia does: every edit writes plain SVG (`<path d>`, `<rect>`, `<circle>` ...) into the file, and every edit to the SVG code redraws the canvas.
3. Use the existing design system only: 25px outer radius, `--r-md`/`--r-sm` for small controls, existing tokens, light and dark, all palettes, 5 languages.
4. Be fully usable with the keyboard and with screen readers where the task allows it (see section 9).

Non-goals for this document

- Raster editing (that is the image editor, `docs/image-editor/`).
- Animation, gradients editor, masks, filters, clipping. See "Open" in section 12.
- Implementation. Section 11 lists the seams a builder would use.

## 2. Where the tools live

Existing layout (see `docs/ARCHITECTURE.md`, `phase1/src/styles/bento.css`): a left icon rail and panel, the centre canvas card, a right inspector card with an icon rail. The centre card already hosts the floating `AlignToolbar`.

Decision: the vector tools are a **floating vertical toolbar inside the centre canvas card**, not a new rail. Reasons: tools act on the canvas and are used with the pointer, the rails switch panels, and a third rail would break the "no duplicated controls" rule.

```
+-- centre card (radius 25) -----------------------------------------+
| tabs: index.html | logo.svg |                          [100%] [..] |
|                                                                    |
|  +----+     canvas / artboard                                      |
|  | V  |                                                            |
|  | A  |        .------.                                            |
|  | P  |       /  path  \                                           |
|  | #  |       \  []----o                                           |
|  | T  |        '------'                                            |
|  +----+                                                            |
|                                       [ align toolbar (2+ sel) ]   |
| status: Editing path - 5 anchor points          Problems (0)       |
+--------------------------------------------------------------------+
```

Placement rules

- Anchored to the left edge of the canvas card, vertically centred, inset `--vt-toolbar-inset` (12px).
- Width `--vt-toolbar-width` (44px), fully rounded ends (`--vt-toolbar-radius` 22px, half the width, so it reads as a pill consistent with the 25px cards).
- Background `--vt-toolbar-bg` (= `--bg-elevated`), shadow `--card-shadow`. No border in light, `1px --border-subtle` in dark.
- Hidden when the active tab is not an SVG or an HTML document with at least one inline `<svg>`. In that case the empty state of section 8 shows instead of the toolbar only for `.svg` tabs; for HTML tabs the toolbar is simply absent and the Insert menu offers "SVG" (existing insert flow).
- It never overlaps the `AlignToolbar` (bottom centre) and collapses to the 3 most used tools under 480px canvas height, with a "More" flyout button for the rest.
- Collapsible with the same gesture as other panels: double click the grab dots at its top. State is remembered per window (same persistence as `sidebarOpen`).

## 2a. One editor, three modes (format-based)

Direction received in the parent agent's message to this task (the message labels it owner steering; the owner's own words were not available to this task, so treat it as a design assumption to confirm): there is one editor entry point. The tool set follows the format of the open file. It is a mode switch inside the same editor window, not three apps.

| Open file | Mode | Tool set | State today (from the repo on this branch) |
|-----------|------|----------|-----------------------------------------------|
| PNG, JPG | Raster | Existing Edit image tools: transform, adjust, filters, selection (`docs/image-editor/`). | Core, kernels and `ImageEditorDialog.tsx` exist. `docs/handover/image-editor-followups.md` says panels are not mounted in the app yet. |
| SVG (and inline `<svg>` in HTML) | Vector | The tools in this document. | Nothing built. |
| PDF | PDF / layout | Not designed here. Needs its own design. | PDFs are read-only previews today (`lib/media.ts`: "previewed, never edited"). |

Design rules for the mode switch

1. The mode is derived from the file, never chosen from a menu. Opening a tab of another format swaps the toolbar and the inspector sections. No mode picker, no "coming soon" entries.
2. The shell stays identical across modes: the same floating toolbar slot at the left edge of the canvas card (section 2), the same status bar, the same inspector card on the right, the same tokens, the same command palette. Only the contents of the slot change.
3. The toolbar slot has one container component with a tool-set provider per mode. Raster and Vector share the container, the tooltip, roving-tabindex and flyout behaviour of section 3. This is what makes it one editor.
4. Shared tools keep the same keys across modes: V select or move, H hand, Z zoom, T text, Escape back to the first tool. Mode-only keys (P pen, A direct select, M marquee, W wand, L lasso) apply only in the mode that has them. A key with no tool in the current mode does nothing, it never falls through to another mode.
5. Raster has its own dialog today. Whether the raster tools move from the dialog into the canvas card, or the vector tools open in a dialog too, is the central builder's call. This document assumes the canvas card. If the builder keeps dialogs, sections 3 to 6 apply inside the dialog with the same layout and tokens.
6. Switching tabs keeps each tab's tool, selection and undo stack. Undo history is per document and, for vector paths, per path-edit session (section 4.2a).
7. PDF mode is out of scope and is listed as open in section 12. Until it exists, PDF tabs show the existing preview and no toolbar.

Wireframe of the slot per mode (tool letters only):

```
Raster (PNG/JPG)    Vector (SVG)      PDF
+----+              +----+            (preview only,
| V  |              | V  |             no toolbar yet)
| C  | crop         | A  |
| M  | marquee      | P  |
| W  | wand         | #  | shapes
| L  | lasso        | T  |
| .. | adjust,      | H  |
| H  | filters      +----+
+----+
```

The raster letters above are a proposal for alignment with the existing selection tools (`docs/image-editor/selection.md`), not a statement of their current shortcuts. Check them against that doc before building.

## 3. Tool bar

Order top to bottom. Icons are from the **Vadivam** set (the global icon set, `vadivam:*`), 18px, 1.5px stroke, in a 36px button (`--vt-tool-button`, radius `--r-md`). If a glyph has no Vadivam equivalent it is drawn as a small inline SVG in the same style, like `AlignToolbar` already does. Which glyphs are missing is listed in section 12.

| # | Tool | Key | Group content |
|---|------|-----|---------------|
| 1 | Select | V | Moves, scales, rotates whole elements. |
| 2 | Direct select | A | Edits anchor points, handles and segments of one path. |
| 3 | Pen | P | Draws and extends paths. Flyout: add anchor (+), delete anchor (-), convert anchor (Shift+C). |
| 4 | Shapes | R | Flyout group, last used shape stays on the button. Rectangle R, Ellipse E, Line L, Polygon Shift+P, Star Shift+S. |
| 5 | Text | T | Click to place, drag to make a text box. |
| 6 | Hand | H or hold Space | Pan. Bottom of the bar, separated by a divider. |

Behaviour

- One tool active at a time. The active button shows `--vt-toolbar-active` background and `--vt-toolbar-icon-on` icon, and `aria-pressed="true"`.
- Tools with a flyout show a 4px corner triangle. Long press (400ms) or right click or `Alt+click` opens it. The flyout is a popup with `--vt-flyout-radius`. All popups in Somnia use a 25px radius, so the flyout uses `var(--r-panel)`.
- Tooltip on hover and focus: `Name (Key)`, 600ms delay, localised. Example: "Pen (P)".
- Toolbar is `role="toolbar"` `aria-orientation="vertical"` with roving tabindex, arrow keys move, Home/End jump, Enter/Space activates, matching `IconRail`.
- Single-letter keys work only when focus is in the canvas region and not in an input, textarea, contenteditable or the code editor. The registry in `lib/commands.ts` already supports `allowInInput`; these commands set it to `false`.
- `Escape` returns to Select from any tool when no drag is in progress. During a pen path it first ends the path (section 4.3).
- The tool also changes with context: double click on a path with Select enters Direct select on that path (same as Figma and Illustrator).

## 4. Canvas interaction

All coordinates are in SVG user units. The canvas keeps its current zoom; every on-canvas size below is in **screen pixels** so handles stay the same size at any zoom.

### 4.1 Select

- Click: select the top element under the pointer. Hit test uses the painted fill plus the stroke widened to at least `--vt-path-hit-width` (8px), so thin lines are clickable.
- Shift+click toggles. Click empty canvas clears. Drag on empty canvas draws a marquee (`--vt-rubber-band` 1px outline, 8% fill). Marquee selects elements it touches; hold `Alt` to require full containment.
- Transform box: 8 square handles (`--vt-transform-handle`, 8px) and a rotate zone just outside each corner (cursor changes, no extra handle). `Shift` keeps ratio, `Alt` scales from centre, `Shift` while rotating snaps to 15 degree steps.
- Arrow keys nudge 1 unit, `Shift+Arrow` 10 units. Delete removes. `Mod+D` already duplicates (existing command, unchanged).
- Locked elements (existing lock concept, `lib/canvasLock.ts`) are skipped by click and marquee. A click on one shows the notice `vector.error.locked` in the status bar.

### 4.2 Direct select

- Click a path: show its anchors as 8px squares (`--vt-anchor-size`) with `--vt-anchor-fill` fill and 1.5px `--vt-anchor-stroke`. Selected anchors fill with `--vt-anchor-selected`.
- Click an anchor selects it and shows its two handles: 6px circles (`--vt-handle-size`) joined to the anchor by a 1px `--vt-handle-line`.
- Drag an anchor moves it. Drag a handle moves it. `Shift` constrains to 45 degree steps. `Alt` while dragging a handle of a smooth anchor breaks the symmetry (turns it into a corner anchor).
- Drag a segment (not an anchor) bends it; the nearest handles move so the curve passes under the pointer.
- Marquee on empty canvas selects anchors inside the box. `Shift` adds.
- `Tab` and `Shift+Tab` move the selection to the next and previous anchor. Arrow keys nudge the selected anchors by 1 (10 with Shift). This is the keyboard route for section 9.
- Hit radius for anchors and handles is `--vt-hit-radius` (8px, so a 16px target); anchors win over handles which win over segments.
- `Delete` on selected anchors removes them and keeps the path open or closed, healing the curve across the gap. Deleting the last two anchors of a path deletes the path after a confirmation-free undo-able step (it is one undo entry).

### 4.2a Path-edit mode

Concepts taken as behaviour ideas from the research report on Penpot (MPL-2.0, ClojureScript). Penpot was not run and its code was not read in depth. Somnia is MIT: nothing is copied or translated from it. The builder writes Somnia code from scratch.

- Entering Direct select on a path (double click, `Enter`, or the A tool) starts a **path-edit session**. Its own selection (anchors and handles) and its own undo stack apply while it runs. `Escape` or clicking outside ends it and the whole session becomes one undo entry in the document history.
- Model: a path is a list of subpaths, each a list of segments (anchor plus in and out handle, open or closed). The UI in 4.2 and 5.1 works on this model; `d` is the serialised form.
- Shapes become paths before any boolean or anchor edit ("Convert to path", see 4.4).
- Boolean results are a **non-destructive combine group** that keeps the source shapes and recomputes when a source changes. "Expand" turns it into a plain `<path>`. How this is written into SVG (nested `<g data-somnia-bool>` plus a generated `<path>`) is not decided. See section 12, item 14. Section 5.1 says Combine replaces the shapes; that is the "Expand" outcome and the default pending that decision.

### 4.3 Pen

States: idle, placing, dragging-handle, closing-hover, ended.

```
idle --click--> placing (first anchor, corner)
placing --click--> new corner anchor, line segment from previous
placing --press+drag--> new smooth anchor, drag pulls symmetric handles
placing --hover first anchor--> closing-hover (anchor ring grows to 12px)
closing-hover --click--> closed path, ended
placing --Enter / double click / Escape / pick other tool--> ended (open path)
```

- A 1px `--vt-path-outline` rubber band previews the next segment from the last anchor to the pointer, including the curve when the previous anchor has an out handle.
- Click on an end anchor of an existing open path with Pen continues that path. Click on the end anchor of a second open path joins the two.
- Hover over a segment of the selected path with Pen shows a "+" cursor (add anchor). Hover over an anchor shows a "-" cursor (delete). `Alt` over an anchor shows the convert cursor.
- `Shift` constrains the next segment to 45 degrees. `Space` while dragging repositions the anchor being placed.
- Ending a path selects it and switches nothing: Pen stays active so the user can start another path. `Escape` twice (or `V`) returns to Select.
- Each path is one undo entry, not one per anchor. Undo while placing removes the last anchor first (placing-state undo), then the path.

### 4.4 Shapes

- Drag to size from corner to corner. `Shift` forces 1:1, `Alt` draws from the centre, `Space` moves the shape while dragging. Click without dragging opens a small popover (a popup, 25px radius) asking for width and height, default 100 x 100.
- Rectangle shows a corner-radius handle at the top-right inside the shape while selected (drag, or type in the inspector).
- Polygon and Star: after drawing, the inspector shows Points (3 to 60, default 5 for star, 6 for polygon) and, for star, Inner radius (10 to 90 percent, default 50). `ArrowUp`/`ArrowDown` during the drag change the point count.
- Output element: `<rect>`, `<ellipse>` (or `<circle>` when rx equals ry), `<line>`, and `<polygon>` for polygon and star. A shape stays its native element while edited with Select. Direct select on it offers "Convert to path" first (notice `vector.error.notPath`), because anchor edits cannot be expressed in `<rect>`.

### 4.5 Text

- Click places point text (`<text>`), drag makes a fixed-width box. Inline editing happens on the canvas with a 1px `--vt-path-outline` caret box. `Escape` or click outside commits. Empty text is removed on commit.
- Font family, size, weight, anchor and letter spacing live in the inspector (section 5). Text stays live text, not outlines. "Create outlines" is open (section 12).
- SVG `<text>` has no automatic wrapping. A dragged text box therefore writes line breaks as `<tspan>` lines at the moment of commit and says so in the inspector ("Wrapped at edit time"). See section 12.

### 4.6 Snapping and guides

- Snap targets: other anchors, element bounds and centres, artboard edges, optional grid.
- Snap radius `--vt-snap-radius` (6px). A match draws a 1px `--vt-snap-guide` line and a 4px cross at the snap point.
- `Ctrl` (`Cmd` on macOS) held while dragging turns snapping off for that drag. A toggle lives in Settings, Editor, "Snap to anchors and bounds" (default on).

### 4.7 Cursors and feedback

Every tool and sub-mode has its own cursor: arrow (Select), hollow arrow (Direct select), pen, pen+, pen-, pen convert, crosshair (Shapes), I-beam (Text), grab/grabbing (Hand). Cursors are 24px SVGs with a 1px light outline so they work on dark and light canvases.

Status bar (existing bottom bar, left side) shows context: "Editing path", "5 anchor points", "Path closed". Strings: `vector.status.*`, `vector.anchor.count`. Debug text never goes to the main screen, per the standing UI rule; only user-facing state does.

## 5. Panels

### 5.1 Right inspector, Design tab

The existing Design tab gets vector sections that appear only when the selection is an SVG element. Sections are collapsible cards with 25px outer radius at the panel level and `--r-md` for inputs. No new rail icon.

```
Design
+-----------------------------------+
| Transform                         |
|  X [ 120 ]   Y [  48 ]            |
|  W [ 200 ]   H [ 100 ]  (link)    |
|  Rotate [ 0 deg ]                 |
+-----------------------------------+
| Fill                              |
|  (swatch) #6366F1     [ 100 % ]   |
|  [none] [solid] [gradient: open]  |
+-----------------------------------+
| Stroke                            |
|  (swatch) #18181B     [ 100 % ]   |
|  Width [ 2 ]                      |
|  Cap   [butt|round|square]        |
|  Join  [miter|round|bevel]        |
|  Miter limit [ 4 ]  (miter only)  |
|  Dash  [ 0 ] [ 0 ]                |
+-----------------------------------+
| Path          (path selected)     |
|  5 anchor points   [ closed ]     |
|  Anchor type: [Corner|Smooth|Sym] |
|  Anchor X [ ]  Y [ ]  (anchor sel)|
|  Corner radius [ 0 ] (rect)       |
|  [Convert to path]                |
+-----------------------------------+
| Combine       (2+ shapes)         |
|  [Union][Subtract][Intersect][Excl]|
+-----------------------------------+
```

Rules

- Segmented controls instead of dropdowns for cap, join and anchor type ("browser use tabs" rule).
- Every field commits on Enter or blur, supports drag-to-scrub on its label, and arrow keys. Invalid input reverts with a 120ms shake that is disabled under `prefers-reduced-motion`.
- Mixed values show "Mixed" as placeholder, never a wrong number.
- Colour fields show hex and open the existing colour popover. No new picker is introduced.
- Each field maps one to one to an SVG attribute or CSS property, so the code view and the inspector always agree: `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`, `opacity`, `d`, `rx`, `transform`.
- Boolean ops (Combine) replace the selected shapes with one `<path>`. They are one undo entry and keep the style of the bottom-most shape. Shortcuts in `vector-tools-shortcuts.json`.

### 5.2 Layers panel

- Vector elements appear in the existing tree with an icon per type (path, rect, ellipse, line, polygon, text), name from `id` or `data-name`, else the localised type name.
- Click selects, double click renames (writes `id`), eye toggles `display`, lock uses the existing lock attribute.
- Drag reorders with the existing drop indicator (the accent line), and writes DOM order.

### 5.3 Code panel

No change in structure. The existing two-way sync is the contract: a canvas edit patches only the affected element's attributes, preserving attribute order, whitespace and comments of untouched elements. This matches "honest saving" and the diff view: a vector edit shows a small, readable diff.

### 5.4 Somnia Agent

Out of scope here. The agent can already edit SVG code; per-hunk review shows vector edits as ordinary diffs. Agent-driven drawing tools are not designed here.

### 5.5 Problems panel

New diagnostics (warning level): path with fewer than 2 anchors, `d` that fails to parse, stroke width 0 with no fill (invisible element), text with no content. Each links to the element.

## 6. Tokens

New tokens are in `vector-tools.tokens.json`. They are built from existing variables so they follow the user's light/dark/palette/accent choice automatically. Only the snap guide colour is new, because it must differ from the accent: dark `#ff4fd8`, light `#c4009f`.

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `--vt-anchor-fill` | `--bg-panel` | `--bg-panel` | anchor square fill |
| `--vt-anchor-stroke` | `--accent` | `--accent` | anchor outline |
| `--vt-anchor-selected` | `--accent` | `--accent` | selected anchor fill |
| `--vt-handle-line` | `--text-tertiary` | `--text-tertiary` | handle line |
| `--vt-path-outline` | `--accent` | `--accent` | hover and edit outline |
| `--vt-rubber-band` | `--accent` | `--accent` | marquee and pen preview |
| `--vt-snap-guide` | `#ff4fd8` | `#c4009f` | snap lines |
| `--vt-toolbar-bg` | `--bg-elevated` | `--bg-elevated` | tool bar surface |
| `--vt-toolbar-active` | `--accent-soft` | `--accent-soft` | active button |
| `--vt-toolbar-icon` | `--text-secondary` | `--text-secondary` | idle icon |
| `--vt-toolbar-icon-on` | `--accent` | `--accent` | active icon |

Sizes: toolbar width 44, toolbar radius 22, inset 12, button 36, anchor 8, handle 6, hit radius 8, path hit width 8, snap radius 6, transform handle 8. Radii for panels and flyouts reuse `--r-outer`/`--r-panel` (25px); small buttons reuse `--r-md` (7px).

Accent: the user's free accent colour (Settings, Appearance) drives every `--accent` reference, so the tokens recolour with it. The tested contrast pairs use the two built-in accents. A user-chosen accent that falls below 3:1 against the panel is already the user's call; the doc does not clamp it. See section 12.

Glass mode: the toolbar uses `--vt-toolbar-bg` with the same opacity and blur as other glass surfaces (`docs/GLASS.md`, `--glass-blur`). Anchors and handles stay opaque so they remain visible over any content.

## 7. Light, dark and palettes

- All colours come from the tokens above, so Light, Dark, Coffee Shop, Forest Green, Midnight Blue, Blue Ice, Grape Red and Melon Pink work without extra rules.
- Contrast is checked in the test for the default light and dark themes (3:1 for graphics, 4.5:1 for the idle tool icon). Named palettes are not tested yet, listed as open.
- Canvas content colours (the user's artwork) never use these tokens. Only the editing chrome does.
- Anchors use a fill plus a stroke so they stay visible over artwork of any colour. A 1px `--bg-panel` halo around the outline is added when the element under it has the same colour as the accent.

## 8. Empty, disabled and error states

| Situation | Behaviour |
|-----------|-----------|
| No document open | Toolbar absent. Existing empty state is unchanged. |
| `.svg` tab, no elements | Toolbar visible, centre hint `vector.empty.noSvg` is shown only when there is no document, so for an empty SVG the hint is replaced by a faint "Press P to draw a path" line using the localised pen name and key. |
| Selection is locked | Edit tools disabled for that element, notice `vector.error.locked`. |
| Selected shape is not a path | Direct select offers "Convert to path" first, notice `vector.error.notPath`. |
| `d` fails to parse | Element drawn as-is by the browser (usually not at all), Problems entry, anchors not shown, inspector Path section shows the parse error text. Code is never rewritten on a parse failure. |
| File is read-only or not saved to disk | Edits still work in memory; the single status indicator handles the saving state, as for any other edit. |
| Collaboration session | Another user's selection shows their cursor name tag and a path outline in their colour. Two users editing the same path: the host-ordered model from the collab architecture applies; anchor-level merging is open (section 12). |

No tool shows a "coming soon" control. A tool that is not built is not in the bar.

## 9. Accessibility

- Every button has `aria-label` and tooltip; toggle state through `aria-pressed`.
- Canvas drawing is pointer-first, which is inherent to freehand vector work. The keyboard route covers: select elements (Tab through the Layers tree), move and resize them (arrows and inspector fields), edit anchors (Tab between anchors, arrows to nudge, inspector X/Y fields), delete, convert anchor type, and combine shapes. Creating a new path with only the keyboard is **not** covered in the first version, but a "Path from points" text field in the inspector (`d` attribute) always works, as does the code panel. This is stated plainly in section 12.
- Live region announces: "Path closed", "5 anchor points", "Anchor 2 of 5 selected, corner" via the status bar `aria-live="polite"`.
- Focus ring is the existing `--focus`.
- Handles never rely on colour alone: anchors are squares, handles are circles, selected anchors are filled.
- `prefers-reduced-motion`: no shake, no ring growth animation, flyouts appear without transition.
- Pointer targets: 16px for anchors and handles, 36px for toolbar buttons. The 8px visual anchor is below the 24px WCAG 2.2 target-size guideline, so the 16px hit area is documented as the supported exception (spacing exception does not apply to dense anchors); inspector fields offer the same actions at full size.
- Scrollbars and tooltips follow the existing rules.

## 10. Internationalisation

- All visible strings use `t()` with keys prefixed `vector.` Proposed text for en, de, es, fr and pt-BR is in `vector-tools-i18n.json`. Non-English strings are machine translated, the same disclaimer as the existing locale files.
- Tooltips combine the localised name and the key: `"{name} ({key})"`. Keys are never translated.
- Layout: the toolbar has no text, so German and Portuguese length growth does not affect it. Inspector labels are short; the longest proposed (`vector.stroke.miterLimit`, "Gehrungsgrenze", "Limite de onglet") must wrap or ellipsise with a title attribute rather than overflow. Check at 100 and 150 percent UI size.
- RTL is a separate project already (see i18n roadmap). The toolbar is on the physical left of the canvas in LTR; for RTL it would mirror. Not designed here.
- ja and zh-CN are planned later; keys here are plain and short for that reason.

## 11. Implementation seams (for the builder)

Pointers only, nothing here is built.

- Toolbar component next to `components/AlignToolbar.tsx`, mounted in `DesignCanvas.tsx`.
- Tool state in `store/appStore.ts` as `vectorTool` plus the pen state machine of section 4.3 in a pure module `lib/vector/pen.ts` so it can be tested with `node:test` without a DOM.
- Path parse, serialise, anchor model and boolean ops in `lib/vector/` as pure functions. Boolean ops need an algorithm or a library; see section 12 before adding one.
- Commands registered through `registerCommand` in `lib/commands.ts` using ids from `vector-tools-shortcuts.json`.
- Styles in a new `styles/vector-tools.css`, only token references.
- Strings merged into `locales/*.json` (test `i18n.test.ts` already checks locale parity).

## 12. Open

Honest list. None of these has a placeholder in the UI.

1. **Gradients, masks, clip paths, filters, blend modes.** Not designed. The Fill section shows only none and solid until a gradient editor exists.
2. **Boolean operations algorithm.** Needs either a hand-written path clipper or a dependency (for example a small polygon-clipping library). Adding one is a heavy-dependency decision for the central builder and needs a flag. Curve-preserving booleans are harder than polygon-only; v1 might flatten curves.
3. **Text.** SVG `<text>` does not wrap. Convert-to-outlines needs font glyph access, which is not available for system fonts in a webview without extra work. Text on a path is not designed.
4. **Icon glyphs.** Vadivam coverage for pen, direct select, star, polygon and hand has not been checked against the icon set in this repo. Missing ones fall back to custom inline SVG glyphs.
5. **Snap guide colours** `#ff4fd8` and `#c4009f` are my pick, only checked at 3:1 against the default panels, not against the named palettes or user accents.
6. **Named palettes and custom accents** are not contrast tested.
7. **Keyboard-only path creation** is not designed beyond the `d` field and the code panel.
8. **Touch and pen input.** Pointer events are assumed. Pressure, palm rejection and long-press flyouts on touch need testing on the Surface.
9. **Collaboration** on a single path (merge at anchor level) depends on the Yjs model for SVG, which is not defined.
10. **Shortcut conflicts on the web build.** Single letters are scoped to the canvas. `Mod+Alt+U/S/I/X/O` and `Mod+Shift+J` are untested in browsers (Firefox and Chrome) and on macOS. Users can remap them through the existing shortcut overrides.
11. **Machine translations** in `vector-tools-i18n.json` are not reviewed by a native speaker.
12. **No visual mock-ups.** Wireframes are ASCII. The actual look at 100 percent and 150 percent UI size needs a review by Philipp once a first build exists. Nothing here has been seen on screen.
13. **Decision for Philipp:** whether the vector tools also act on inline `<svg>` inside HTML pages in v1 or only on standalone `.svg` files. This document assumes both, the toolbar is shown for either, but the second doubles the sync work.
14. **Boolean model.** Non-destructive combine group versus immediate replace. The group needs a documented SVG representation that other tools still render correctly, and the geometry kernel decision (own code, paper.js, or polygon libraries) from the Wave 4 library research. That research reports paper.js as MIT per npm but GitHub's detector returned NOASSERTION, last release July 2024, about 84 KB gzip, lazy-load. Nothing was measured or tested in this repo. Needs a dependency flag.
15. **Modes.** PDF mode is undesigned. The raster tool letters in section 2a are unchecked against the existing selection tools. Whether tools sit in the canvas card or the existing dialog is open.
16. **Provenance.** The format-based-mode direction reached this task through the parent agent. The research report and its Penpot addendum were read as external reference data; the licence reading in it is unreviewed by a lawyer.
