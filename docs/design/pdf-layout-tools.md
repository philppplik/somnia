# PDF and layout tools: UI/UX design

Status: design only (wave 5). This file specifies the PDF/document mode and the shared mode frame (section 2a). No code, no new dependencies. Library choice and licensing are covered by the separate w4 PDF research and licence check; this document does not repeat them. It only assumes the engine can (a) render a page to a canvas, (b) list/reorder/rotate/delete/insert pages, (c) place text, image and shape objects on a page, (d) add annotations, (e) save a copy.

## 1. Principles

1. Same bento look as the rest of Somnia: rounded cards on `--shell-bg`, `--gap` between cards, `--r-outer` (default 25px, user adjustable 0-25px) on the three main cards, `--r-panel` (25px) on dialogs and popups, `--r-control` (16px) for the toolbar pill, `--r-md`/`--r-sm` for small controls.
2. No bloat in the main screen. Status and engine messages go to the Problems panel. Settings live in Settings. Icons only in the toolbar, with tooltip and aria-label (Vadivam icon set).
3. Non-destructive by default. "Save" writes a new copy (`name (edited).pdf`) unless the user chooses "Overwrite" in a confirm step. The source is never touched silently. Closing with unsaved changes warns (data loss is critical).
4. Everything local. Nothing is uploaded. No account needed.
5. One control per job. No duplicated tabs and icons.
6. Every control is keyboard reachable and named for screen readers.

## 2. Entry points

| Entry | Behaviour |
|---|---|
| Open a `.pdf` from Files panel or drop on the window | Opens as a tab of kind `pdf` in the editor area. Today PDFs open as preview tabs (MediaPreview); the new tab replaces that view and keeps a "Preview only" toggle for read-only use. |
| Tools > PDF > New from images / Merge | Opens the same tab with a generated page list. |
| Command palette | `pdf.open`, `pdf.addText`, `pdf.addImage`, `pdf.addShape`, `pdf.annotate`, `pdf.export`. |
| Convert dialog | Unchanged. It stays the place for format conversion. A "Open in PDF editor" link is shown for `.pdf` rows. |

## 2a. One editor, format-based modes (owner steering)

There is one editor entry, not three apps. The opened file's format picks the mode; the shell, tab, cards, save flow, undo scope and status bar are shared. Only the toolbar contents, the left card and the properties sections change.

| Format (by signature, then extension, same detection as Convert) | Mode | Left card | Toolbar tools | Properties |
|---|---|---|---|---|
| PNG, JPG, WebP, GIF, BMP | Raster | Edit history (operation stack) | Select/move, Crop, Transform, Adjust, Filter, Selection (rect, lasso, wand) | Existing Edit image panels (Transform, Adjust, Filter, Selection) |
| SVG | Vector | Layers/objects tree | Select, Node edit, Rectangle, Ellipse, Line/Pen, Text, Boolean ops | Position/size, fill, stroke, opacity, SVG code link |
| PDF | Document (this spec) | Page thumbnails | Select, Text, Image, Shape, Annotate | Page and object sections (section 3.4) |

Rules:
1. Shared frame: same three-card bento layout, same toolbar pill component, same view pill, same Properties card shell, same Save/Close behaviour (copy by default). Only the content of each slot is mode-specific. A mode is a registry entry `{formats, leftCard, tools[], propertySections[]}`; the editor window never branches on format elsewhere.
2. Mode switch happens on open and on tab change, with no extra dialog. The mode name appears only as the tab icon and an aria-label on the editor region ("Editor, PDF mode"), not as visible chrome.
3. Cross-mode actions live in one place, a mode-aware "Open as..." entry in the tab context menu and Tools menu: SVG or PDF page to raster ("Edit page as image", opens a raster tab on a rendered copy), raster to PDF page ("Place in PDF", via the Image tool). These always create a new tab and a copy, never convert in place.
4. The existing Edit image dialog is not rewritten. Raster mode first mounts it inside the editor frame (its panels become the Properties card); the dialog stays available as a fallback until parity is shown. Raster mode is a re-hosting, not a new feature set.
5. Unknown or unsupported formats keep today's behaviour (code editor or preview tab). The mode registry is data, so extensions could register a mode later (out of scope).
6. Shortcut letters are shared where the meaning matches (V select, T text, S shape); mode-specific tools get their own letters, checked for conflicts per mode.
7. i18n: shared chrome strings use an `editor.` prefix (`editor.mode.raster`, `editor.mode.vector`, `editor.mode.document`, `editor.openAs`); mode strings keep their own prefixes (`imgedit.`, `pdf.`, and `svg.` for vector).

Vector mode is only outlined here (table above); it needs its own spec. Raster mode adds no new design beyond re-hosting.

## 3. Layout (desktop, 1280 x 800 reference)

The PDF tab fills the editor area of the shell. The shell's left rail and file tabs stay as they are. Inside the tab there are three cards plus a floating toolbar pill.

```
+-- file tabs ---------------------------------------------------------------+
| [report.pdf *] [index.html]                                                |
+---------------------------------------------------------------------------+
|  gap                                                                       |
|  +-----------+  +---------------------------------------+  +-------------+ |
|  | PAGES  [+]|  |   ( T  Img  Shape  Pen | Undo Redo )  |  | PROPERTIES  | |
|  |           |  |       toolbar pill, centred, 16px r   |  |             | |
|  | +-------+ |  |                                       |  | Page 3 of 12| |
|  | |  1    | |  |   +-------------------------------+   |  | Size  A4    | |
|  | +-------+ |  |   |                               |   |  | Rotate  [↻] | |
|  | +-------+ |  |   |        page canvas            |   |  |             | |
|  | |  2    | |  |   |   (page on --canvas-bg)       |   |  | -- object --| |
|  | +=======+ |  |   |                               |   |  | X  Y  W  H  | |
|  | ‖ 3  ◀  ‖ |  |   |   [selected text box]         |   |  | Font / size | |
|  | +=======+ |  |   |                               |   |  | Fill Stroke | |
|  | +-------+ |  |   +-------------------------------+   |  | Opacity     | |
|  | |  4    | |  |                                       |  | Layer order | |
|  | +-------+ |  |   [- 100% +] [fit] [<  3 / 12  >]     |  |             | |
|  +-----------+  +---------------------------------------+  +-------------+ |
+---------------------------------------------------------------------------+
| status bar: Somnia pill | Problems | "Unsaved changes" (single indicator)  |
+---------------------------------------------------------------------------+
```

Widths: thumbnails card 168px (collapsible to a 56px rail with page numbers only), properties card 288px (collapsible to a rail), canvas card takes the rest. Cards are separated by `--gap`. Below 900px the properties card becomes a bottom sheet; below 640px the thumbnails card becomes a horizontal strip above the canvas.

### 3.1 Page thumbnails card

- Header: title "Pages" (`pdf.pages`), icon button "Add page" with a small menu: Blank page, From image, From PDF.
- Each thumbnail is a rendered bitmap (max 120px wide, lazy: only visible plus 2 pages on each side are rendered, the rest show a skeleton block). Page number below it, 11px, `--text-tertiary`.
- States: default (`--border-subtle` 1px), hover (`--bg-hover`), selected (2px `--accent` outline, `--accent-soft` fill behind), multi-selected (same outline on each), dragging (50% opacity ghost plus a 2px `--accent` insertion line between pages).
- Interactions:
  - Click selects and scrolls the canvas. Ctrl/Cmd+click toggles, Shift+click selects a range.
  - Drag and drop reorders (one or many pages). Keyboard: focus a thumbnail, Alt+Up/Down moves it.
  - Context menu (right click): Rotate left, Rotate right, Duplicate, Delete, Insert blank page before/after, Extract pages..., Select all.
  - Delete key deletes selected pages after a one-line undoable action (no confirm dialog; undo toast in the status bar region is not used, Undo covers it). Deleting all pages is blocked: the last page cannot be removed.
  - Rotation badge appears on a rotated thumbnail (small icon, `--text-secondary`).
- Accessibility: the list is `role="listbox"` with `aria-multiselectable`, each item `role="option"`, `aria-label` "Page 3 of 12". Reorder announces "Moved to position 5" in a polite live region.

### 3.2 Toolbar (floating pill, top centre of the canvas card)

Icons only, 32px hit area (36px on touch), 16px icon. Groups separated by a 1px `--border-subtle` divider. The pill uses `--bg-elevated`, `--card-shadow`, radius `--r-control`.

| Group | Tool | Shortcut | Notes |
|---|---|---|---|
| Select | Select / move | V | Default. Esc returns to it. |
| Insert | Text | T | Click for a text box, drag for a fixed-size box. |
| Insert | Image | I | Opens the file picker; the image attaches to the cursor, click to place. Also drop an image on the page. |
| Insert | Shape | S | Small popover: Rectangle, Ellipse, Line, Arrow. Remembers the last choice. |
| Annotate | Annotate | A | Popover: Highlight, Underline, Strikethrough, Sticky note, Freehand. |
| History | Undo, Redo | Ctrl+Z, Ctrl+Shift+Z | Same history as the app, scoped to the tab. |

Rules: exactly one tool is active (`aria-pressed`). The active tool uses `--accent-soft` background and `--accent` icon. Tooltips show name plus shortcut. A popover tool shows a tiny chevron corner mark. No labels on the pill; the active tool's name is announced to screen readers through a live region.

View controls (zoom out/in, fit width, fit page, previous/next page, page number field) sit in a second, smaller pill at the bottom of the canvas card. Zoom 25-400%, Ctrl+wheel zooms, space+drag pans.

### 3.3 Canvas

- Pages are stacked vertically (single column scroll) with a 24px gap on `--canvas-bg`. A page has a white background in both themes (`--page-bg`), 1px `--border-subtle` edge and a soft shadow in light mode. The page is a document, so it does not follow the dark theme.
- Selection: 1.5px `--accent` outline, 8 square handles (8px, white fill, `--accent` stroke) plus a rotation handle for text/image/shape. Handles have a 24px invisible hit area. Snap guides (page centre, margins, other objects) appear as 1px `--accent` lines within 6px; hold Alt to disable snapping.
- Text editing is inline on the page. Esc or click outside commits. Enter makes a new line; Ctrl+Enter commits.
- Annotation objects are drawn above content and listed separately in the properties card so they can be hidden or flattened on save.
- Empty state (no page rendered yet): centred spinner with text "Opening PDF...". Failure (encrypted or damaged file): inline card on the canvas with the reason and a "Choose another file" button; the detailed message is also written to the Problems panel.
- Encrypted PDFs: a small password dialog (`--r-panel`). The password is never stored.

### 3.4 Properties card

Header shows context: "Page 3 of 12" with nothing selected, or the object type ("Text", "Image", "Rectangle", "Highlight") when selected. Sections are collapsible, state remembered per section.

- Page (nothing selected): size (preset select: A4, A5, Letter, Legal, Custom + width/height in mm or in, follows locale), orientation, rotation (0/90/180/270), margins guide toggle and values, background (page colour, off by default).
- Position and size (any object): X, Y, W, H number fields with unit label, lock-aspect toggle, rotation angle, align row (left, centre, right, top, middle, bottom) using the existing align icons.
- Text: font family (select: the 14 standard PDF fonts plus any embedded in the file; no font upload in v1), size, weight/italic toggles, alignment (4 toggles), line height, colour swatch, letter spacing. A warning chip "Font not embedded" is shown when the saved copy would use a substitute.
- Image: replace, crop (opens the existing image editor dialog on a copy), fit mode (fill, fit, stretch), opacity, alt text field (feeds the PDF tag if the engine supports it, otherwise stored as an annotation comment).
- Shape: fill (colour + none), stroke colour, stroke width, dash style, corner radius (rectangle only), arrow heads (line only).
- Annotation: colour (6 presets + custom), opacity, author (from the local profile nickname), comment text.
- Arrange: bring forward/backward, to front/back, group is out of scope for v1.
- Footer actions: Duplicate, Delete (icon buttons).

Number fields accept arithmetic-free decimals, commit on Enter or blur, revert on Esc, arrow keys step 1 (Shift 10). Invalid input shows `aria-invalid` plus a message in the Problems panel, never a blocking dialog.

## 4. Save, export, close

- Ctrl+S: if the file was opened from disk, writes a new file `name (edited).pdf` next to the source (clash handling follows the Convert dialog rule `name (2).pdf`). A first-time info row in the Save dialog explains that the original is kept. "Overwrite original" is an explicit checkbox, off by default, with a one-line warning.
- Export submenu in the Project/File menu: Save a copy, Flatten annotations, Export pages as images (PNG, ZIP for many pages), Export selected pages as PDF.
- Opened-from-browser mode: uses the File System Access API when available, otherwise a download.
- Close with unsaved changes uses the existing close dialog (Save / Don't save / Cancel). A single status indicator ("Unsaved changes") is used; no second indicator in the tab.

## 5. Design tokens

Only existing tokens are used (defined in `phase1/src/styles/tokens.css`). No new global token is added. PDF-specific values are component-local CSS variables defined on `.pdf-editor` in a future `pdf-editor.css`.

Existing tokens used:

`--shell-bg`, `--bg-base`, `--bg-panel`, `--bg-elevated`, `--bg-surface`, `--bg-hover`, `--border-subtle`, `--border-default`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--accent`, `--accent-fill`, `--accent-soft`, `--warning`, `--danger`, `--canvas-bg`, `--page-bg`, `--page-ink`, `--ui-font`, `--mono`, `--focus`, `--shadow`, `--card-shadow`, `--gap`, `--r-outer`, `--r-panel`, `--r-control`, `--r-lg`, `--r-md`, `--r-sm`, `--glass-blur`.

Component-local values (proposed, on `.pdf-editor`):

| Variable | Value | Use |
|---|---|---|
| `--pdf-thumb-w` | 120px | thumbnail bitmap width |
| `--pdf-pages-w` | 168px (rail: 56px) | pages card width |
| `--pdf-props-w` | 288px (rail: 56px) | properties card width |
| `--pdf-tool-size` | 32px | toolbar button hit area |
| `--pdf-handle` | 8px | selection handle size |
| `--pdf-page-gap` | 24px | gap between pages |
| `--pdf-snap` | 6px | snap distance |

Radii: cards `--r-outer`; toolbar pill and view pill `--r-control`; popovers, menus and dialogs `--r-panel` (25px); fields and buttons `--r-md`; thumbnails `--r-sm` is NOT used for the page bitmap itself (pages are square-cornered like paper); the thumbnail frame uses `--r-md`.

Theme behaviour:

| Element | Light | Dark |
|---|---|---|
| Cards | `--bg-panel` with `--card-shadow` | `--bg-panel`, no shadow |
| Canvas background | `--canvas-bg` (#e6e6eb) | `--canvas-bg` (#0a0a0c) |
| Page | `--page-bg` white | `--page-bg` white (documents keep paper colour) |
| Selection | `--accent` (#4f46e5) | `--accent` (#818cf8) |
| Text on cards | `--text-primary/secondary` | same tokens |

Named palettes (Coffee Shop, Forest Green, Midnight Blue, Blue Ice, Grape Red, Melon Pink) work automatically because only tokens are used. Glass mode: the three cards follow "Glass inner panels"; the page bitmap, thumbnails, menus and dialogs stay opaque. High contrast: selection outline 2px, handles 10px, focus ring `--focus` always visible. Reduced motion: no zoom animation, instant page jumps.

Motion: 120ms ease-out for hover and popovers, none for drag.

## 6. Internationalisation (en, de, es, fr, pt-BR)

All strings come from the locale files (`phase1/src/locales/*.json`) under the `pdf.` prefix; no hard-coded text. Proposed keys (English value, German value as the review anchor; es, fr, pt-BR follow the same keys and need native review as in `docs/i18n/TRANSLATION-REVIEW.md`):

| Key | en | de |
|---|---|---|
| `pdf.pages` | Pages | Seiten |
| `pdf.page.of` | Page {n} of {total} | Seite {n} von {total} |
| `pdf.page.add` | Add page | Seite hinzufuegen |
| `pdf.page.rotateLeft` | Rotate left | Nach links drehen |
| `pdf.page.rotateRight` | Rotate right | Nach rechts drehen |
| `pdf.page.delete` | Delete page | Seite loeschen |
| `pdf.page.duplicate` | Duplicate page | Seite duplizieren |
| `pdf.page.extract` | Extract pages... | Seiten extrahieren... |
| `pdf.tool.select` | Select | Auswaehlen |
| `pdf.tool.text` | Text | Text |
| `pdf.tool.image` | Image | Bild |
| `pdf.tool.shape` | Shape | Form |
| `pdf.tool.annotate` | Annotate | Annotieren |
| `pdf.shape.rect` | Rectangle | Rechteck |
| `pdf.shape.ellipse` | Ellipse | Ellipse |
| `pdf.shape.line` | Line | Linie |
| `pdf.shape.arrow` | Arrow | Pfeil |
| `pdf.annot.highlight` | Highlight | Markieren |
| `pdf.annot.underline` | Underline | Unterstreichen |
| `pdf.annot.strike` | Strikethrough | Durchstreichen |
| `pdf.annot.note` | Sticky note | Notiz |
| `pdf.annot.draw` | Freehand | Freihand |
| `pdf.props.title` | Properties | Eigenschaften |
| `pdf.props.page` | Page | Seite |
| `pdf.props.position` | Position and size | Position und Groesse |
| `pdf.props.text` | Text | Text |
| `pdf.props.fill` | Fill | Fuellung |
| `pdf.props.stroke` | Stroke | Kontur |
| `pdf.props.opacity` | Opacity | Deckkraft |
| `pdf.props.altText` | Alt text | Alternativtext |
| `pdf.props.arrange` | Arrange | Anordnen |
| `pdf.zoom.in` | Zoom in | Vergroessern |
| `pdf.zoom.out` | Zoom out | Verkleinern |
| `pdf.zoom.fitWidth` | Fit width | Breite anpassen |
| `pdf.zoom.fitPage` | Fit page | Seite anpassen |
| `pdf.save.copy` | Save a copy | Kopie speichern |
| `pdf.save.overwrite` | Overwrite original | Original ueberschreiben |
| `pdf.save.overwriteWarn` | This replaces the original file. | Das ersetzt die Originaldatei. |
| `pdf.open.password` | This PDF is password protected. | Dieses PDF ist passwortgeschuetzt. |
| `pdf.error.damaged` | This PDF could not be opened. | Dieses PDF konnte nicht geoeffnet werden. |
| `pdf.status.opening` | Opening PDF... | PDF wird geoeffnet... |
| `pdf.font.notEmbedded` | Font not embedded | Schrift nicht eingebettet |

Rules: German and Spanish strings are 20-35% longer than English, so buttons use `min-width` plus ellipsis and the properties card labels wrap to two lines instead of clipping. Units follow the locale (mm in de/es/fr/pt-BR, inch in en-US) with a Settings override. Numbers use the locale decimal separator in fields. Pluralised messages (`pdf.pages.count`) use the existing i18n plural helper. RTL layouts are a separate project and are not specified here. Shortcut letters (V, T, I, S, A) are kept in all locales for muscle memory; localised tooltips show the shortcut in brackets.

## 7. Accessibility checklist

- Full keyboard path: F6 cycles Pages card, canvas, Properties card. Toolbar is a `role="toolbar"` with roving tabindex. Arrow keys nudge a selected object by 1px (Shift 10px). Tab inside the canvas moves selection to the next object on the page.
- Object list alternative: Properties card has an "Objects on this page" list so non-pointer users can select, reorder and delete objects.
- All icon buttons have `aria-label` and tooltip; tooltips also appear on focus.
- Colour is never the only state signal (selected thumbnails also get an outline; warnings carry an icon and text).
- Contrast of text and handle outlines meets WCAG AA in all palettes (checked with the existing a11y helper `phase1/src/lib/a11y.ts` when implemented).
- Touch targets 36px minimum in touch mode.

## 8. Acceptance criteria for the implementation task

1. PDF tab opens from Files panel, drop and command palette. Preview-only toggle still works.
2. Thumbnails: select, multi-select, reorder by drag and keyboard, rotate, duplicate, delete, insert blank; last page cannot be deleted.
3. Toolbar: five tools plus undo/redo, one active tool, shortcuts and tooltips.
4. Text, image and shape objects can be placed, moved, resized, rotated, styled from the properties card; undo/redo covers all of it.
5. Save writes a copy by default; overwrite is explicit; unsaved-close warning works.
6. Light, dark and each named palette render without hard-coded colours (grep check: no hex colours in `pdf-editor.css` except inside the page bitmap).
7. All `pdf.*` keys exist in the five locale files (the existing i18n test enforces key parity).
8. Large file behaviour: 200 pages open without rendering all thumbnails at once (windowed rendering), memory stays bounded by the visible window.

## 9. Open questions

See the "Open" list in the handover (`docs/handover/pdf-layout-ux.md`).
