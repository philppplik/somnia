# Studio shell panel consolidation (shell wave 2)

One shared style source for studio panel, rail and inspector surfaces:
`phase1/src/components/shell/panelStyles.ts`. Studios import the canonical
class strings instead of redeclaring them per file.

- `panelField` / `panelFieldCompact` / `panelFieldMini`: bordered panel inputs
  (regular, compact and mini density).
- `panelSection` + `panelSectionTitle` + `panelLabel` + `panelHint` /
  `panelHintPadded`: inspector sections, headings, labels and hints.
- `panelSlider` / `panelCheck`: accent range sliders and fixed-size checkboxes.

Adopted in: animation (16 files), video, sound, photos, vectorstudio (inspector,
shell panels, tools and node panels), design. Documents, Sheets and Slides
dialogs keep their local strings for now (parallel office work); adopt the same
exports there when that lands. `src/components/shell/panelStyles.test.ts`
fails if one of the old strings is redeclared in an adopted area.

## Token reference fixes (dark-theme legibility)

References to tokens that do not exist fall back to their literal (usually
light) fallback or invalidate the declaration. Fixed references now point at
the canonical tokens in `src/styles/tokens.css`:

- Vector Studio canvas backdrop used `var(--surface-2, #eef0f4)`: in dark
  theme the whole canvas surround rendered light grey. Now `var(--canvas-bg)`,
  which is theme-aware (the artboard itself keeps the light transparency
  checker, as intended for a document surface). Same fix on the PDF stage
  backdrop (`pdfedit/PdfViewer.tsx`).
- Sheets frozen rows/columns and image surface: `var(--surface)` to
  `var(--bg-surface)` (previously white in dark theme).
- Sound arrange clip fill: `color-mix(..., var(--surface))` was invalid and
  dropped; now mixes against `var(--bg-surface)`.
- Image-adjust curve panel (`--surface`) and Photos curves points
  (`--elevated`): now `--bg-surface` / `--bg-elevated`.
- Deploy setup wizard (`publish.css`): `--text-muted`, `--bg`, `--border`,
  `--text`, `--surface-2` had no fallbacks, so borders/backgrounds silently
  disappeared; now the canonical `--text-secondary`, `--bg-base`,
  `--border-default`, `--text-primary`, `--bg-surface`.
- Legacy `--border` and `--mono-font` names in `variants.css`, `global.css`,
  `svg-editor.css`, `agent.css` now use `--border-default`, `--mono` and
  `--text-secondary`.
- `--r-popup: 25px` is defined centrally next to the other radii; the 22
  dialog surfaces that referenced it keep their look.
- `bg-canvas` now resolves: `--color-canvas: var(--canvas-bg)` is registered
  in the Tailwind theme, so the sound studio's canvas-tinted inputs render as
  written instead of falling back to the default input surface.

## Vector tools/node panels

`vectorControlStyle` (inline style object) is now the class string
`vectorControlClass` with identical geometry and token paint; all inline style
objects in the tools, node and pen panels moved to Tailwind classes. Only
genuinely dynamic values (drag geometry, depths, aspect ratio) stay inline.
