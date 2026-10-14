# Contributor token tables

Runtime sources: `phase1/src/styles/tokens.css`, `global.css`, `bento.css`,
`lib/look.ts`, `lib/importedTheme.ts`. Foundation JSON/palette tables are reference only;
inspect computed CSS for the chosen theme/preferences. Do not invent a DTCG runtime.

| CSS role | Tailwind semantic utility stem | Purpose |
| --- | --- | --- |
| --bg-base | base | editing base |
| --bg-panel | panel | workspace card |
| --bg-elevated | elevated | menu/popover |
| --bg-surface | surface | nested control |
| --bg-hover | hover | neutral hover |
| --border-subtle | subtle | separator/input |
| --border-default | line | visible border |
| --text-primary | ink | main text |
| --text-secondary | ink-2 | supporting text |
| --text-tertiary | ink-3 | hint/metadata |
| --accent | accent | exact saved accent seed / active paint |
| --accent-fill | accent-fill | filled action |
| --action-ink | action-ink | foreground paired with filled action |
| --accent-soft | accent-soft | selection surface |
| --focus-ring | CSS outline only | visible keyboard focus |
| --status-{success,warning,danger,info}-ink | {success,warning,danger,info}-ink | semantic status foreground |
| --status-{success,warning,danger,info}-surface | corresponding -surface | paired status surface |
| --canvas-bg | CSS only | authoring stage, not shell override |
| --page-bg / --page-ink | CSS only | document defaults, not shell override |

Use utility prefixes by property: `bg-panel`, `text-ink-2`, `border-line`.
Semantic aliases are additive; legacy status paints are not all migrated.
`--action-ink` resolves custom or theme ink in normal contrast; high contrast chooses its own fixed pair.
A saved custom accent updates fill, soft and ink without changing its exact seed value.

| Geometry | Default | Owner |
| --- | --- | --- |
| --r-sm / --r-md / --r-lg | 5 / 7 / 11px | independent small radii |
| --r-control / --r-panel | 16 / 25px | pill / branded panel |
| --r-outer | 25px, user 0-25 | frame and workspace cards |
| --gap | 3 / 6 / 10px | compact / normal / comfortable density |
| --ui-zoom | user 0.85-1.30 | app UI zoom, not universal control resizing |
| --ui-font / --mono | system stack | shell/editor fonts |

No proportional radius ladder or automatic density row-height scaling. Imported `radius`, fonts,
shadows, tracking, spacing and charts are not geometry setters. Never alias raw shadcn `--accent`
to Somnia's saved seed: shadcn accent means an interactive neutral surface.

## Namespaced exchange aliases

These aliases resolve legacy roles without an import. With an import, normal-mode recognized values
live in `--sc-*`; only the production target subset also changes legacy paint.

| Alias | Default legacy role |
| --- | --- |
| `--sc-background` | `--bg-base` |
| `--sc-foreground` | `--text-primary` |
| `--sc-card` | `--bg-panel` |
| `--sc-card-foreground` | `--text-primary` |
| `--sc-popover` | `--bg-elevated` |
| `--sc-popover-foreground` | `--text-primary` |
| `--sc-primary` | `--accent-fill` |
| `--sc-primary-foreground` | `--action-ink` |
| `--sc-secondary` | `--bg-surface` |
| `--sc-secondary-foreground` | `--text-secondary` |
| `--sc-muted` | `--bg-hover` |
| `--sc-muted-foreground` | `--text-tertiary` |
| `--sc-accent` | `--bg-hover` |
| `--sc-accent-foreground` | `--text-primary` |
| `--sc-destructive` | `--danger` |
| `--sc-destructive-foreground` | `--status-danger-ink` |
| `--sc-border` | `--border-default` |
| `--sc-input` | `--border-subtle` |
| `--sc-ring` | `--focus-ring` |
| `--sc-sidebar` | `--bg-panel` |
| `--sc-sidebar-foreground` | `--text-primary` |
| `--sc-sidebar-primary` | `--accent-fill` |
| `--sc-sidebar-primary-foreground` | `--action-ink` |
| `--sc-sidebar-accent` | `--bg-hover` |
| `--sc-sidebar-accent-foreground` | `--text-primary` |
| `--sc-sidebar-border` | `--border-subtle` |
| `--sc-sidebar-ring` | `--focus-ring` |

Production targets: background/foreground/card/popover/primary/primary-foreground/secondary/muted/
muted-foreground/destructive/border/input/ring. See `APP_IMPORT_TARGETS` for exact variable writers.
Other paired colors remain isolated aliases; shared legacy foregrounds do not become independent global writers.
High contrast bypasses all imported overrides. Custom inline action choices still win normal-mode fill/ink.
No importer writes --accent, geometry, syntax, document/page or native material.
