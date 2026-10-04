# Look options (Settings > Appearance)

Concept: every option is a CSS variable on `:root`, stored in `somnia.look.v1`, applied before first paint (`applyLook` in `main.tsx`). Reset restores defaults.

| Option | Range | Mechanism |
|---|---|---|
| Accent colour | any `#rrggbb`, default theme accent | `--accent`, `--accent-soft`, `--accent-ink`; contrast vs panel shown, warns below 3:1 (WCAG 1.4.11) |
| Interface size | 85-130 % | `zoom` on `#root`, app frame height compensated |
| Editor font size | 10-22 px | `--editor-font-size` in the CodeMirror theme |
| Editor line height | 1.2-2.0 | `--editor-line-height` |
| Density | compact / normal / comfortable | `--gap` (space between cards) |
| Contrast | standard / high | existing `data-contrast` |

Limits: interface size 130 % needs a window of about 1250 px width (min app width scales with it). Accent text colour is chosen automatically (`textOnAccent`) but only where `.accent-fill` or `--accent-ink` is used. Not verified on real Windows.
