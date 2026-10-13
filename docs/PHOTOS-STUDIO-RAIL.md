# Photos studio rails

Status: data and icons are in place and tested. They are not wired into the Photos manifest yet (see "Wiring").

The Photos studio declares its left and right rail as plain data, using the panel API in [concepts/studio-shell.md](concepts/studio-shell.md) section 9. Code lives in `phase1/src/lib/photos/`:

| File | Purpose |
| --- | --- |
| `shellRail.ts` | `PHOTOS_LEFT_RAIL`, `PHOTOS_RIGHT_RAIL` (`RailItemDef[]`), `PHOTOS_DEFAULT_LAYOUT`, `PHOTOS_PANEL_IDS`, label keys |
| `railIcons.tsx` | Vadivam glyphs and the icon name map registered in `lib/shell/railIcons.ts` |
| `shellRail.test.ts` | Unit tests |
| `../../locales/photos/rail.<locale>.json` | Tooltip strings in en, de, es, fr, pt-BR |

## Items

Global items (Files, Search, Extensions, Settings, Chat, Agent) come from the shell. The studio adds:

| Side | Item id | Icon name | Glyph | Pinned by default | Panel id |
| --- | --- | --- | --- | --- | --- |
| Left | `history` | `History` | clock | yes | `history` |
| Left | `info` | `Info` | info circle | no (overflow) | `info` |
| Right | `light` | `DevelopLight` | sun | yes | `light` |
| Right | `color` | `DevelopColor` | palette | yes | `color` |
| Right | `effects` | `DevelopEffects` | sparkles | yes | `effects` |
| Right | `detail` | `DevelopDetail` | eye | yes | `detail` |
| Right | `transform` | `DevelopTransform` | frame | yes | `transform` |

The right items follow the develop sections that exist today (`PhotosInspector`: light, color, effects, detail, transform) and the order of the develop pipeline. Every item is `kind: 'panel'` and its `panel` equals its `id`. The panel definitions must declare exactly these ids on the matching side (`PHOTOS_PANEL_IDS`); `validateStudioShell` reports any mismatch.

There are no `command` or `tool` items yet. Photos has no registered UI commands (undo, redo, reset, crop and export are buttons in the canvas bar), and rail items of those kinds need real command ids. Adding them is a follow-up that belongs with the Photos command set.

## Icons

`History` and `Info` are generic names, so any studio that shows the same function reuses the same glyph. The develop sections use a `Develop` prefix. `Palette`, `Sparkles`, `Eye` and `Frame` reuse existing Vadivam exports; `sun` and `clock` are new. `registerPhotosRailIcons()` runs when `shellRail.ts` is imported and is idempotent (the registry is first-wins). `lib/icons.tsx` exports `makeVadivamIcon` so a studio can add glyphs without editing the shared file.

## Customization defaults

- First open: left side closed, right side open on Light, widths 260 and 320 (`PHOTOS_DEFAULT_LAYOUT`). The canvas keeps the room.
- Rail overrides start empty. Users can reorder, pin, unpin and hide through `railResolver`; `when` always wins. No item here has a `when`, so every item shows as soon as the studio is active.
- `info` is the only item that starts in overflow.

## Labels

`RailItemDef.label` is a plain string (English fallback). Tooltips use `photosRailLabel(item, t)`, which reads `photos.rail.<id>` and falls back to the label. The renderer must call it, or an equivalent, for the other four languages to show.

## Wiring

To enable the rails, the Photos manifest sets `shellV2.leftRail = PHOTOS_LEFT_RAIL`, `shellV2.rightRail = PHOTOS_RIGHT_RAIL` and `shellV2.defaultLayout = PHOTOS_DEFAULT_LAYOUT`, next to the panel definitions that use the ids above. Until then the old manifest rail (`Files`, `Develop`) stays in place.

## Verified and not verified

Verified by unit tests: validator passes against panels built from the ids, icons resolve and render as Vadivam SVG, resolver behaviour for defaults, reorder, hide, pin and reset, label keys in five locales. Not verified: rendering inside the real `IconRail`, keyboard focus, and native window behaviour, because the shell renderer does not read these rails yet.
