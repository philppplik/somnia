# Slides studio rail

Status: implemented on top of the studio shell contract ([studio-shell.md](studio-shell.md), sections 9.4 and 4.3a).
Source: `phase1/src/lib/slides/shellRail.ts` (data), `phase1/src/lib/studios/slides.ts` (manifest), labels in
`phase1/src/locales/slides-rail/*.json` merged by `phase1/src/lib/railI18n.ts`.

## Items

Left rail, in default order:

| id | kind | target | icon | default |
| --- | --- | --- | --- | --- |
| `files` | panel | `files` (Code host `code.files`) | `Files` | pinned |
| `overview` | panel | `overview` (slide thumbnails) | `Copy` | pinned, open on first start |
| `outline` | panel | `outline` | `Hash` | pinned |
| `search` | panel | `search` (Code host) | `Search` | pinned |
| `versions` | panel | `versions` (Code host) | `VersionsIcon` | pinned |
| `saveCopy` | command | `slides.saveCopy` | `Download` | pinned, movable |
| `undo` | command | `slides.undo` | `Undo2` | overflow, movable |
| `redo` | command | `slides.redo` | `Redo2` | overflow, movable |

Right rail: one item, `inspector` (`Presentation`), which opens the generic `shell.inspector` panel. Its sections (slide text,
presentation, compatibility) are declared in `slidesInspector` in `lib/slides/panelDefinitions.ts`.

## Icons

The same function keeps the same glyph in every studio, so Slides reuses the Documents choices (`Files`, `Copy` for the
page overview, `Hash` for the outline, `Search`, `VersionsIcon`). Only `Undo2`, `Redo2` and `Download` were missing from the
shared set; `registerSlidesRailIcons()` registers them. Registration is first-wins, so it never changes a glyph another studio
already registered.

## Customization defaults

- Rail overrides start empty. `undo` and `redo` start in the overflow ("...") menu because the Edit menu, shortcuts and the
  command palette already reach them; "Save a copy" is the only command with a pinned slot.
- Command items have no `when`. Their own `enabled` state (busy, nothing to undo) decides whether they act.
- The user can reorder (drag or `shell.rail.moveUp|moveDown`), pin, unpin, hide and reset. Edits to one side never change the other.
- First-open layout (`SLIDES_DEFAULT_LAYOUT`): overview open on the left (260 px), inspector open on the right (320 px).

## Labels

Items with a `labelKey` use the catalogue entries `slides.rail.<id>` in en, de, es, fr and pt-BR. The shared items (Files,
Search, Versions) keep their English label, like in Documents.

## Tests

- `src/lib/slides/shellRail.test.ts`: manifest passes `validateStudioShell`; every panel item targets a rail panel on its own
  side; every contract panel has an item; command ids are registered; default pin and overflow state; customization edits
  through `editRailOverrides`/`railModel`; icon registration and first-wins; catalogue keys in all five locales.
- `src/components/studios/SlidesRail.test.tsx`: renders `IconRail` for Slides (items, icons, German labels, overflow button)
  and checks the Code rail has no overflow button.
