# Documents studio rail

Status: manifest, icons, customization defaults, tests and localization are in place. The studio panels
`outline` and `find` and the inspector sections `document`/`selection` are wave A's hosts
(`components/documents/DocumentsPanelContents.tsx`, registered by `components/documents/registerShell.ts`);
this document covers the rail side (wave B). Base: `int/shell` `bd58d7e`.

The Documents manifest is pure data and lives in `phase1/src/lib/studios/documents.ts`. It composes:

| Export | Purpose |
| --- | --- |
| `documentsPanels` | Studio-agnostic panels (`files`/`search`/`versions` on the shared Code hosts), foundation's `pages`, wave A's `DOCUMENTS_PANELS` (`outline`, `find`), and the generic inspector panel (`shell.inspector`, right) |
| `documentsLeftRail` / `documentsRightRail` | The rail items (`RailItemDef[]`) |
| `documentsInspector` | The inspector section list (`document`, `selection`, `text`, `risks`) |
| `DOCUMENTS_LAYOUT` | First-open layout: Files left, inspector right, widths 260/320 |
| `DOCUMENTS_COMMANDS` | Foundation command ids plus wave A's `DOCUMENTS_PANEL_COMMANDS`, for the validator and the palette |

## Rail items

| Side | Item id | Icon name | Glyph | labelKey | Panel | Host |
| --- | --- | --- | --- | --- | --- | --- |
| Left | `files` | `Files` | vadivam folder-code (shared) | — | `files` | `code.files` |
| Left | `pages` | `BookOpen` | vadivam book-open (new) | `documents.rail.pages` | `pages` | `documents.pages` |
| Left | `outline` | `List` | vadivam list (new) | `documents.rail.outline` | `outline` | `documents.outline` (A) |
| Left | `find` | `FileSearchCorner` | vadivam file-search-corner (new) | `documents.rail.find` | `find` | `documents.find` (A) |
| Left | `search` | `Search` | shared | — | `search` | `code.search` |
| Left | `versions` | `VersionsIcon` | shared | — | `versions` | `code.versions` |
| Right | `inspector` | `FileText` | shared | `documents.inspector` | `inspector` | `shell.inspector` |

Every item is `kind: 'panel'`; there are no `tool` or `command` items yet. The order follows the concept
(docs/concepts/studio-shell.md 3.6): global navigation first (Files, Search), then the studio items
(Pages, Outline, Find), then Versions. Search sits with the navigation block; Versions closes the rail.

## Icons

Names resolve through the rail icon registry (`lib/shell/railIcons.ts`); the base set is registered by
`components/shell/railIconSet.ts`. Documents adds three Vadivam glyphs in `lib/documents/railIcons.ts`
(`list`, `book-open`, `file-search-corner`, inlined like `lib/icons.tsx` does, via `makeVadivamIcon`).
`registerDocumentsRailIcons()` runs when the manifest module loads and is idempotent (registry is
first-wins). Same function, same glyph: `FileSearchCorner` is deliberately distinct from the global
project `Search`, and `List` from Code's `Layers`.

## Customization defaults

- All items are pinned by default; nothing starts hidden or in the overflow. No item carries a `when`:
  the studio panels render their own empty state when no document is open, so the rail stays stable.
- First open (`DOCUMENTS_LAYOUT`): left side open on `files`, right side open on the inspector.
- Reorder, pin, overflow, hide and reset come from the shell (`store/railActions.ts`, `RailMenu`);
  `when` would always win over user overrides.

## Inspector sections

The right rail opens the generic inspector (`shell.inspector`). The section list maps wave A's section
ids onto their hosts; `text` and `risks` stay foundation hosts:

| Section | Host | Shown when | Collapsed |
| --- | --- | --- | --- |
| `document` | `documents.inspector.document` (A) | always | no |
| `selection` | `documents.inspector.selection` (A) | `selection.kind == 'one'` | no |
| `text` | `documents.inspector.text` | `services.ready` | yes (default) |
| `risks` | `documents.inspector.risks` | `services.risks` | no |

## Localization

`documents.rail.find` was added to all five catalogues (en, de, es, fr, pt-BR); the other labelKeys and
titleKeys already existed. The rail tooltip falls back to the English `label` if a key is missing.

## Contract with wave A

The manifest imports `DOCUMENTS_PANELS` and `DOCUMENTS_PANEL_COMMANDS` from `lib/documents/panels.ts`
(wave A). `registerStudioPanels` throws when manifest and hosts drift, so the two patches must land
together: A's patch supplies the `documents.find` panel host, the `documents.outline` host and the
`documents.inspector.document` / `documents.inspector.selection` section hosts.

## Verified and not verified

Verified locally: `npx tsc --noEmit`, `npm run check:ui-commands`, `npm run check:layers`, the shell and
studio unit suites, `src/lib/documents/shellRail.test.ts` (validator against the real host and icon
registries, rail composition, section resolution, icon rendering, customization defaults, layout,
locale parity of every labelKey/titleKey), and the foundation's `src/lib/shell/documentsShell.test.ts`
(updated for the added `find` item). Screenshots of the rail, panel stack, context menu, overflow menu
and dark theme were taken through the agent harness. Not verified: the real WordCraft engine paths
(no Rust toolchain in this environment; the seven `real engine` tests fail on the clean base too),
wave A's actual panel content, and the native desktop chrome.
