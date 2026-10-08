# Shared Studio direction

[Overview](README.md) / Shared Studio direction

**Status: planned / under construction at the implementation baseline.** The Studio S0/S1 rebase is not present at `d91046f`. This page maps the existing repository concept to the implementation evidence without inventing a future API or claiming a completed migration.

## 1. Concept source

The source is [PDF and layout tools, section 2a](../pdf-layout-tools.md#2a-one-editor-format-based-modes-owner-steering), titled "One editor, format-based modes". It describes a shared editor entry and common shell rather than independent apps. The existing [vector design](../vector-tools.md) and [appearance surfaces](../appearance-surfaces.md) supply related format/appearance contracts.

The intended format-aware frame shares:

- Shell, document tabs and three-card bento layout.
- Save/close behavior and document-owned undo.
- Toolbar pill, view treatment, property-card shell and status region.
- Mode-specific tools, left-card content and property sections.

The design sketches a registry entry `{formats, leftCard, tools[], propertySections[]}`. This is a concept shape, not an exported TypeScript API in this snapshot. Do not import it or promise extension registration from it.

## 2. Planned mode matrix

| Design mode | Document family | Intended left card | Intended tool/property content |
| --- | --- | --- | --- |
| Raster | PNG/JPG/WebP/GIF/BMP | Operation history | Select, crop, transform, adjust, filter, pixel selection |
| Vector | SVG | Objects/layers | Select, nodes, shapes, pen, text, fill/stroke |
| Document | PDF | Pages | Select, insert, annotate, page/object properties |

This table is the concept's scope, **not** a shipped import-support list. The implementation media sniffing supports a narrower binary set; the SVG source editor and inline PDF paths are separate integrations. Office documents, spreadsheets, presentations and sound are not established as integrated Studio modes by this baseline. Engine experiments are not UI contracts.

## 3. Planned behavior

The concept requires format-based opening and tab switching without a second mode dialog. Mode information should live in an accessible region name/tab icon rather than extra visible chrome. Cross-mode "Open as" actions create a new tab and copy, never transform the only source silently. Examples: render an SVG/PDF page into a raster copy, or place an image in a PDF.

Raster reuses the existing editing implementation; re-hosting is not a reason to reimplement its non-destructive stack. Unknown/unsupported formats retain a truthful source/preview fallback. Shared shortcuts keep the same meaning where possible and are checked for per-mode conflicts.

The concept also describes future narrow-width layouts. The current global app has a 960 x 600 px minimum; those future bottom-sheet/thumbnail-strip breakpoints are not a present responsive-shell guarantee.

## 4. What exists now

| Concern | Implemented baseline | Remaining integration |
| --- | --- | --- |
| Common shell | App, rails, titlebar, status, cards | Normalize mode-aware rail/slot meaning |
| Format rendering | Canvas routing, binary sniffing, inline raster/SVG/PDF | One authoritative routing/capability contract |
| Properties | HTML, SVG, raster, PDF own panels | Shared lifecycle, mixed values, no stale target |
| Commands | Registry + scopes; raster shared overrides; PDF own IDs | Consistent active-document routing across editors |
| History/dirty | Core plus editor-specific state | One presentation contract without merging unrelated histories |
| Copy/export | Format-specific paths | Uniform intent with truthful fidelity limits |
| Tokens | Shared CSS, look preferences, format tokens | Reduce hardcoded exceptions and inconsistent popup rules |
| Extensions | Side-panel registration | Mode registration remains out of scope in concept |

## 5. Required migration evidence

Before changing this page to "implemented", verify against the integrated commit:

1. Find the actual exported Studio types, reducer/registry, adapters and tests. Link those, not a temporary branch name.
2. Open raster, SVG, PDF and source tabs in alternating order. Confirm rails, tools, selection, history, dirty markers and save owner remain correct.
3. Test async completion after tab change, source replacement and project close. Stale work must not mutate the new context.
4. Check shared shortcut conflicts with text inputs and Markdown. Toolbar, menu, palette and keyboard must agree.
5. Test copy/export and dirty closure for every mode, including failed save and cancellation.
6. Check read-only/permission limits in each format; no predicate name counts as proof.
7. Inspect actual pixels in light/dark/high contrast, long translations, zoom and collapsed panels. A reducer test cannot prove visual stability.
8. Remove obsolete branches/duplicate docs only through the normal integration process; keep one home for each concept.

Do not rename this baseline's distributed routing a complete context-aware Studio system before that evidence exists.
