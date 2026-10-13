# Studio shell: cross-studio tabs, rails and Save All / Close All

Status: proposed concept and design. Section 9 (panel API) is the stable contract for the shell foundation; the rest is not implemented. Needs Philipp's OK on concept and design before any dev work.
Baseline: `int/alpha4` (`03d5fea`). Grounded in the code paths listed under "Current state".

## 1. Goal

One consistent frame around nine studios. The frame (title bar, tab strip, rails, bottom bar) stays spatially stable. Only its content changes with the active studio and the active document.

Philipp's asks, in his words:

1. A button in the Project tab at the top for **Save all files** and one for **Close all files**, **across studios**.
2. The upper tab strip is **context-aware per studio**.
3. The rails left and right hold **per-studio icons with tabs**. "Da muss man mal gross ran und refaktorisieren."

## 2. Current state (what the code does today)

| Area | Where | Today |
| --- | --- | --- |
| Studio definition | `lib/studios/registry.ts`, one file per studio | `StudioDef.shell` has `leftRail`, `rightRail`, `header.menus`, `bottomBar`, `inspector`. Rail ids are a closed union (`layers/files/search/assets/components/css/versions`, `design/prototype/code`). |
| Left/right rail | `components/IconRail.tsx` | One component, but it mixes four sources: studio manifest, `railFor(domain)` from `contextRegistry.ts`, hard-coded exceptions (`native` raster/vector/pdf, diff-split button only in Code, `code` item pushed when surface is code), and extension panels. Icon names come from a local `railIcons` map. |
| Panels behind rails | `App.tsx` | Choice between `RasterLeftPanel`, `PdfPagesPanel`, extension panel, `StudioSidebar`, and the same four on the right. Raster and PDF override the studio by checking the document, not the studio. |
| Tab strip | `components/FileTabs.tsx` | Two lists drawn into one strip: text files (`openFiles`) and media (`useMedia().items`). Dirty marker only for media (`rasterDirty`, `pdfIsDirty`, `slidesIsDirty`). Close menu: close, close others, copy path. No studio awareness. |
| Dirty state | `appStore.isDirty`, `lib/sheets/session.ts`, `lib/slides/session.ts`, `lib/pdfedit/session.ts`, `store/rasterState.ts` | Five separate stores. No single "what is dirty" query. `hasDirtySheets`, `hasDirtyPdfs` exist, others are per name. |
| Close flow | `lib/closeFlow.ts`, `CloseDialog.tsx` | Two kinds only: `disk` and `memory`. Handlers registered by the adapter. Handles one project close, not a list of documents. |
| Per-tab studio | `appStore.studioByTab`, `studioRouting.ts`, `openCoordinator.ts` | Each tab remembers its studio. Smart Open switches the studio. A manual pill visit locks tab navigation. |
| Header menu | `App.tsx` header, `header.menus` | "Project" menu is a category of commands (Open Folder, Open File, Save Project, Export, Close Project). Not all studios list it (Slides: `View, Help`). |

Problems this causes for Philipp's asks:

- There is no list of "all open documents across studios". Text tabs and media tabs are separate stores, and Sheets/Slides/PDF/Raster/Video/Sound each hold their own session.
- `IconRail` has studio special cases in code, so every new studio edits the shared component.
- Rail items cannot carry per-studio tab groups. A rail icon opens one panel, panels cannot declare sub-tabs.
- The tab strip does not know which studio a tab belongs to, so it cannot show context.

## 3. Target picture

Three layers, each with one owner:

```
Document Registry   (new)   what is open, which studio owns it, dirty or not, how to save/close it
Studio Manifest v2  (ext.)  per studio: rails with tab groups, tab-strip behaviour, header actions
Shell components    (refac) TabStrip, Rail, PanelHost, ProjectActions render from the two above
```

Rule: the shell never asks "which studio is this?". It asks the manifest and the registry.

### 3.1 Document Registry

One module, `lib/documents/registry.ts`. Each studio session registers a document adapter once.

```ts
interface DocAdapter {
  studio: StudioId;
  list(): DocRef[];                       // {id, name, kind, studio}
  isDirty(id: string): boolean;
  save(id: string): Promise<SaveResult>;  // 'saved' | 'needs-location' | 'failed'
  close(id: string, opts: {discard: boolean}): Promise<void>;
  subscribe(cb: () => void): () => void;  // fires on open/close/dirty change
}
registerDocAdapter(adapter)
useOpenDocuments(): DocRef[]              // all studios, stable order
useDirtyDocuments(): DocRef[]
```

Adapters wrap the existing stores. They do not replace them:

| Adapter | Wraps |
| --- | --- |
| Code (text files) | `appStore.openFiles`, `isDirty`, `closeFileTab` |
| Media (image, raster) | `lib/media.ts`, `rasterState` |
| PDF / Documents | `pdfedit/session.ts` |
| Sheets | `sheets/session.ts` |
| Slides | `slides/session.ts` |
| Sound, Video | their workspace sessions |
| Design, Vector | their document stores |

Vibe Space has no documents. It registers none and its tab strip is hidden (see 3.3).

### 3.2 Save All / Close All

Placed in two spots, same command:

- **Project menu** (top header): `Save all` (Ctrl+Alt+S) and `Close all` (Ctrl+Alt+W) under Save Project. These are commands in the command registry, so they also appear in the command palette.
- **Tab strip**, right end: two icon buttons (save-all, close-all) with tooltips. Close all is also in the strip's overflow menu.

Both act on **all studios**, not the active one. Optional later: a per-studio variant in the tab-strip context menu ("Close all in this studio").

Save all:

1. `useDirtyDocuments()` gives the list. Empty list: button disabled, tooltip "Nothing to save".
2. Save sequentially in tab order. Each result is collected, nothing aborts the whole run on first failure.
3. A document with `needs-location` (untitled, never saved) is not given a silent default path. The run pauses on it and opens the normal save dialog, then continues. Cancel skips only that document.
4. Result goes to the status line, never a popup, unless something failed: `Saved 5 files. 1 failed: report.xlsx (disk full)` with a link into the Problems panel. This matches "no bloat in the main screen".

Close all:

1. No dirty documents: close everything, return to the studio's blank start screen.
2. Dirty documents: one dialog (extend `CloseDialog`) listing them grouped by studio with a checkbox each. Buttons: **Save selected and close**, **Discard and close**, **Cancel**. Nothing is discarded without that dialog. Data loss is critical.
3. Save failure during "save and close" keeps that document open and dirty, closes the rest, and reports it.
4. `closeFlow.ts` gains a third kind `documents` that drives this. Existing `disk`/`memory` kinds stay untouched.

Edge cases to test: a studio in a modal edit state (image editor dialog open), a document that changed on disk since opening (conflict path must win over silent overwrite), collab sessions (close all must not end the session, only local tabs), the last-tab rule in `closeFileTab` (`openFiles.length<=1` currently blocks closing the final tab, close all needs a defined empty state).

### 3.3 Context-aware tab strip

The tab strip reads `useOpenDocuments()`. Behaviour:

- **Scope**: one strip, all open documents of all studios, in open order. This keeps cross-studio work visible and is what "Save all across studios" operates on.
- **Studio marker**: each tab shows the studio glyph (`StudioGlyph`) before the name, in the studio's colour at low emphasis. Active studio's tabs are full contrast. Tabs of other studios are slightly dimmed but fully clickable (click = smart-open style switch, per `studioByTab`).
- **Dirty dot** on every tab, from the registry. Today only media tabs have one.
- **Context-aware right end**: the strip's trailing actions come from the active studio's manifest (`tabStrip.actions`). Code: split toggle and diff. Sheets: none. Video: none. The two global buttons (save all, close all) are always last and never move.
- **Context-aware filter**: optional toggle "Only this studio". Off by default.
- **Hidden** in Vibe Space (no documents) and in the empty start screen of any studio.
- Tab context menu extends today's: close, close others, close all, close all in this studio, copy path, reveal in Files.

### 3.4 Manifest v2: rails with tab groups

`StudioDef.shell.leftRail` and `rightRail` become typed by an open id and carry panels with tabs:

```ts
interface RailItem {
  id: string;                  // open string, not a closed union
  icon: IconId;                // from one shared icon registry
  label: string;               // i18n key
  placement: 'top' | 'bottom';
  when?: (ctx: UiContext) => 'show' | 'grey' | false;   // replaces railFor + hard-coded exceptions
  panel: PanelId;              // component registered with the PanelHost
  tabs?: {id: string; label: string; icon?: IconId}[];  // sub-tabs inside the panel
  global?: boolean;            // same item in every studio (Files, Search, Settings)
}
```

What changes:

- `IconRail` becomes a dumb renderer: manifest items + global items + extension items. No `if studio === 'code'` anywhere.
- The `native` branch (raster/vector/pdf documents opened inside Code) moves into `when()` functions on the Code manifest, or better, disappears because those documents route to their own studio (Smart Open already does this).
- Raster and PDF panel overrides in `App.tsx` (`RasterLeftPanel`, `PdfPagesPanel`...) become normal `panel` registrations of their studios.
- Panels register with a `PanelHost` (`registerPanel(id, Component)`), so the grid slot in `App.tsx` renders one `<PanelHost side="left"/>` and one for the right.
- Sub-tabs: a panel with `tabs` gets a slim tab row at its top. Example: Code > Versions has History, Changes, Variants, Compare (today four separate tab components in `components/versions/`).
- Keyboard: roving focus and ArrowUp/Down stay (already in `IconRail`).
- A11y: each rail is a toolbar with labels, each panel a region named after its rail item.
- Bottom of left rail stays global: Extensions, Settings. Bottom of right rail stays global: Chat, Agent. These are `global` items, not special JSX.

### 3.5 Rails per studio (proposed content)

`L` = left rail, `R` = right rail. Global left: Files, Search, Extensions, Settings. Global right: Chat, Agent.

| Studio | L (studio items) | R (studio items) | Sub-tabs |
| --- | --- | --- | --- |
| Code | Layers, Components, CSS, Versions | Design, Prototype | Versions: History / Changes / Variants / Compare. Design: Layout / Style / Effects / Advanced |
| Documents | Outline, Versions | Document | Document: Page / Text / Styles |
| Sheets | Sheets list, Versions | Cell | Cell: Format / Number / Conditional |
| Slides | Slides | Slide | Slide: Text / Layout / Notes |
| Sound | Tracks | Effects | Effects: Edit / Filter / Export |
| Video | Media, Timeline layers | Clip | Clip: Trim / Audio / Titles / Export |
| Design | Artboards, Layers | Design | Design: Fill / Stroke / Effects / Export |
| Vector | Layers | Shape | Shape: Fill / Stroke / Path / Align |
| Photos | Layers, History | Develop | Develop: Light / Colour / Detail / Crop |
| Vibe Space | none | none | (own sidebar, unchanged) |

This is a proposal built from what each studio exposes today. The exact lists are an open question (section 7), not a decision.

### 3.6 Icon and tab systematik

- **One icon registry** (`lib/icons`, Vadivam set as already decided). Manifest stores an `IconId`, not a lucide import. Removes the local `railIcons` map in `IconRail.tsx`.
- **Same function, same icon in every studio**: Layers is always Layers, Versions always Versions, Files always Files. A studio may add items, it may not reuse a global icon for something else.
- **Order**: global navigation first (Files, Search), then studio items in manifest order, global utilities at the bottom.
- **Active state**: accent-soft background (as today), `aria-pressed`. Click the active icon again collapses the panel (as today).
- **Tooltips** carry the short name and shortcut. Shortnames come from `studioShortName.ts` pattern.
- **Right rail never follows context** by default (decision of 2026-10-08), optional setting stays.
- **Tabs vs rails**: rails switch panels. Tabs inside a panel switch views of that panel. No item is shown in both places (his "no duplicated controls" rule).

## 4. Design (layout)

Whole frame, Code studio with three open documents from two studios:

```
+--------------------------------------------------------------------------------+
| logo  Project Edit View Insert Tools Help  [ctx chip] undo redo   (Code|Sheets|...)   [Cmd+K] Account  _ [] x |
+----+----------------+---------------------------------------------+----------------+----+
| ◫  | LEFT PANEL     | [</> index.html ●][▦ budget.xlsx][</> a.css]  💾all ✕all |  RIGHT PANEL   | ◫  |
|----|  (tabs: sub)   |---------------------------------------------| (tabs: sub)    |----|
| 📁 |                |                                             |                | ⚙  |
| 🔍 |                |                  CANVAS                     |                | ▶  |
| ≡  |                |                                             |                |    |
| ◧  |                |                                             |                |    |
| 🌿 |                |                                             |                |    |
|    |                |                                             |                |    |
| 🧩 |                |                                             |                | 💬 |
| ⚙  |                |                                             |                | ✨ |
+----+----------------+---------------------------------------------+----------------+----+
| status line: Saved 2 files.    viewport | cursor | zoom                    update pill |
+--------------------------------------------------------------------------------------+
```

Tab strip detail (right end is fixed):

```
[</> index.html ●] [▦ budget.xlsx] [</> a.css]  ........  [split] [diff] | [💾 Save all] [✕ Close all]
 ^studio glyph  ^dirty dot                                 ^from manifest   ^always last, global
```

Close all dialog:

```
Close all files?
 3 files have unsaved changes
 [x] index.html        Code
 [x] budget.xlsx       Sheets
 [ ] a.css             Code
 [Save selected and close]  [Discard and close]  [Cancel]
```

Rail with sub-tabs (Code, Versions panel):

```
| ◧ |  Versions                |
|   |  History  Changes  Variants  Compare   <- panel tabs
|   |  ----------------------- |
```

### 4.1 Components

| Component | Status | Responsibility |
| --- | --- | --- |
| `shell/TabStrip.tsx` | new, replaces `FileTabs.tsx` | Renders `useOpenDocuments()`, studio glyph, dirty dot, manifest actions, global buttons |
| `shell/TabStripActions.tsx` | new | Save all / Close all buttons, disabled states, tooltips |
| `shell/Rail.tsx` | new, replaces `IconRail.tsx` | Renders manifest + global + extension items, no studio branches |
| `shell/PanelHost.tsx` | new | Looks up the active rail item's panel and renders it, with `PanelTabs` when `tabs` exist |
| `shell/PanelTabs.tsx` | new | Slim sub-tab row, uses existing `ui/tabs.tsx` |
| `lib/documents/registry.ts` | new | Adapter registry, hooks, save-all/close-all orchestration |
| `lib/documents/adapters/*.ts` | new | One thin adapter per existing store |
| `components/CloseDialog.tsx` | extend | Third kind `documents`, list with checkboxes |
| `lib/closeFlow.ts` | extend | Kind `documents`, handlers from the registry |
| `lib/studios/registry.ts` | extend | `RailItem` v2, `tabStrip.actions`, open ids |
| `lib/commands` | extend | `file.saveAll`, `file.closeAll`, shortcuts, palette entries |
| `App.tsx` | slim down | Header menus plus one `<Rail side/>`, one `<PanelHost side/>` each, one `<TabStrip/>` |

## 5. Migration

Small steps, each shippable and each keeping the UI pixel-identical until the last one:

1. **Document Registry + adapters** for Code and media. Tab strip unchanged. Unit tests for the registry. No UI change.
2. **Adapters for Sheets, Slides, PDF, Raster, Sound, Video, Design, Vector.** Still no UI change. Add `useDirtyDocuments` test across studios.
3. **Save all / Close all commands** and the `documents` close kind. Menu items first (lowest risk), then dialog.
4. **TabStrip** replaces `FileTabs`: studio glyph, dirty dot everywhere, global buttons, manifest actions.
5. **Manifest v2 types** with a compatibility shim that converts v1 manifests, so studios migrate one at a time.
6. **Rail + PanelHost** replace `IconRail` and the panel switch in `App.tsx`. Move the special cases into manifests. Code first (pixel-identical gate), then the other studios get their own items from 3.5.
7. **Panel sub-tabs** for Versions (already has four views), then Design inspectors.
8. i18n for en/de/es/fr/pt-BR, screenshot baselines, docs update.

Gates for each step: `tsc`, `vitest`, `check:commands`, i18n parity, Playwright snapshot baselines for Code (must not change in steps 1-5).

## 6. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Save all overwrites a file changed on disk | Data loss | Registry `save` must go through the existing conflict check, never a raw write. Conflict stops that document and reports it. |
| Close all discards work | Data loss (critical) | Single dialog, dirty documents listed, no default-destructive button. Tested with every studio dirty. |
| Studios hold state outside their store (modal editors, WASM engines) | Save returns before the engine flushed | Adapter `save` must await the engine flush. Add a per-adapter contract test. |
| Big refactor of `IconRail` and `App.tsx` regresses Code | Visual and behavioural regressions | Compatibility shim, Code migrated first behind snapshot baselines. |
| Open-string rail ids lose type safety | Typos | Typed `defineRail()` helper plus a manifest validation test that every rail id has a registered panel. |
| Merge conflicts with running swarms (Live View work touches `LivePreview`, not the shell) | Rework | Shell work stays out of `LivePreview*` and the preview pipeline. Start after W1-W4 are merged, or on a separate integration branch. |
| Collab sessions | Close all ends a shared tab by accident | Close all only closes local tabs. A shared document asks once. |
| Extension panels | Break when rail model changes | Extension panels stay as global rail items. Shim keeps `extensionPanels` API unchanged. |
| Scope creep to nine studios at once | Late delivery | Steps 1-4 deliver Philipp's save/close wish without waiting for the rail refactor (steps 5-7). |

## 7. Open questions for Philipp

1. **"Reiter Projekt"**: do you mean the **Project menu** in the top header, the **tab strip** over the editor, or both? This doc puts the buttons in both places. Easy to drop one.
2. **Tab strip scope**: one strip with all studios' documents (proposed), or only the active studio's tabs with a studio switch moving you between sets?
3. **Close all** should leave which screen: the current studio's blank start screen (proposed) or Code's?
4. **Rail contents in 3.5**: are these the right items per studio? Especially Photos (Layers/History left) and Video (Media/Timeline left).
5. Per-studio "Close all in this studio" in the tab context menu: wanted or noise?
6. Shortcuts: Ctrl+Alt+S and Ctrl+Alt+W OK, or do you want Ctrl+Shift+S for save all?

## 8. Out of scope

No change to studio switching (pill), Smart Open routing, the agent panel, status bar content, or the Live View pipeline. No new studio.

## 9. Panel API for studio authors

Status: the contract below is stable. Studios build their rails, panels and inspectors against it. Documents is the reference migration (`lib/studios/documents.ts`, `components/documents/`).

A studio declares everything in `StudioDef.shellV2` (`lib/shell/types.ts`). The shell never branches on a studio id.

### 9.1 Types

```ts
interface PanelDef {
  id: string;                       // unique per studio
  title: string; titleKey?: string; // titleKey is an i18n key and wins over title
  component: string;                // host id, registered with registerPanelHost
  side: 'left' | 'right';
  icon?: string;                    // rail icon name
  placement?: 'rail' | 'docked';    // default 'rail'
  when?: string;                    // expression over StudioContext, see when.ts
  commands?: readonly string[];     // commands this panel owns or triggers
  persistKey?: string;              // key for usePanelState, default '<studio>.<id>'
  defaultOpen?: boolean; minHeight?: number; tool?: string;
}

interface RailItemDef {
  id: string; icon: string; label: string; labelKey?: string; order: number;  // labelKey (i18n) wins over label
  kind: 'panel' | 'tool' | 'command';   // 'action' is the old spelling of 'command'
  panel?: string; tool?: string; command?: string;
  when?: string; badge?: string; defaultPinned?: boolean; movable?: boolean;
}

interface StudioContext {            // published by the active canvas
  studio: string;
  document?: { id: string; kind: string; dirty: boolean; readOnly: boolean };
  mode?: string;
  selection: { kind: 'none' | 'one' | 'many'; type?: string; count: number; ids?: readonly string[] };
  data?: Record<string, unknown>;    // small, JSON only, studio specific (e.g. { styleId: 'Heading1' })
  activeTool?: string; busy: boolean; services: Record<string, boolean>;
}

interface PanelHostProps { panelId: string; context: StudioContext }
```

`StudioShellDef` carries `panels`, `leftRail`, `rightRail`, `tools`, `defaultLayout`, `menus`, `statusSlots`, `problems`.

### 9.2 Writing a panel

A migrated studio has two halves. The manifest (`lib/studios/<id>.ts`) is pure data and must not import components. The hosts live in `components/` and are registered once.

```ts
// lib/studios/documents.ts (data)
export const documentsShell: StudioShellDef = {
  panels: [
    {id: 'pages', title: 'Pages', titleKey: 'documents.rail.pages', component: 'documents.pages', side: 'left'},
    {id: 'inspector', title: 'Document', component: 'shell.inspector', side: 'right'},
  ],
  leftRail: [{id: 'pages', icon: 'Copy', label: 'Pages', labelKey: 'documents.rail.pages', kind: 'panel', panel: 'pages', order: 20}],
  inspector: {sections: [{id: 'selection', title: 'Selected paragraph', component: 'documents.inspector.selection', when: "selection.kind == 'one'"}]},
};

// components/documents/registerShell.ts (hosts)
registerStudioPanels(documentsStudio, {
  panels: {'documents.pages': PagesPanel},                         // Component<{panelId, context}>
  sections: {'documents.inspector.selection': SelectionSection},   // Component<{sectionId, context}>
});
```

- `registerStudioPanels` throws when the manifest names a host that is missing or a supplied host is not named, so the two halves cannot drift. Shared hosts (for example `code.files`) may be referenced without supplying them.
- A panel host receives the merged `StudioContext`. It re-renders when the canvas reports a change.
- Panel UI state that must survive reloads goes through `usePanelState(persistKey, initial)` (`store/panelStateStore.ts`). JSON values only.
- Import the registration module once from `App.tsx` (the hosts file must not import it, that would be a cycle).

### 9.2a Inspector

The inspector is a panel with `component: 'shell.inspector'` (side right). Its content is `shellV2.inspector.sections`: each section has `id`, `title`/`titleKey`, `component` (a section host), optional `when`, `order`, `commands` and `defaultCollapsed`. The host owns the chrome: title, collapsible sections (state persisted per studio), an empty state (`emptyKey`) when no section applies. Sections whose `when` is false are not rendered, so a canvas that publishes no selection simply shows the sections that do not need one.

### 9.2b Commands

Actions are commands with payloads, registered by a `lib/<studio>/commands.ts` (`registerXCommands()`, called when the canvas mounts, same pattern as Sheets). Add the source to `scripts/dump-ui-commands.ts` and run `npm run inventory:ui-commands`. Documents is the reference (`documents.pages.goto {page}`, `documents.outline.goto {block}`, zoom, undo, redo).

### 9.3 Placement and `when`

- `rail` (default): the user opens it from a rail item. Several rail panels of one side stack, can be collapsed, reordered and closed. `when` false: the panel is not rendered and its rail item is hidden.
- `docked`: no rail item. The panel joins the end of the side stack while `when` holds and leaves when it does not. Use for selection properties.
- `when` is the same expression language as menus, shortcuts and the palette. Missing paths are falsy, so a panel that depends on `selection` stays hidden in a canvas that never reports one.

### 9.4 Rail items and customization

- `kind: 'panel'` toggles the panel (`panel` must exist on the same side and be a `rail` panel).
- `kind: 'tool'` activates a `ToolDef` and opens its `opensPanel`.
- `kind: 'command'` runs a command. No panel.
- `icon` is a name from the rail icon registry (`lib/shell/railIcons.ts`, `registerRailIcons`). An unknown name renders the fallback glyph and fails `validateStudioShell`. The same function keeps the same icon in every studio.
- The user can reorder (drag, or the move commands), pin, move to overflow, hide and reset per studio: right-click a rail icon, or use the overflow (...) button. The commands are `shell.rail.moveUp|moveDown|pin|unpin|hide|show|reset` (payload `{side,id}`, otherwise the last focused rail icon). Overrides persist in the shell layout store. The rail resolver (`railResolver.ts`) applies them; `when` always wins over them. Code keeps its legacy rail until it is migrated (it has no `shellV2.panels`).

### 9.5 Selection context

The active canvas claims the context once and reports changes:

```ts
const ctx = studioContextStore.claim('documents', {id, kind: 'docx', dirty: false, readOnly: false});
ctx.report({selection: {kind: 'one', type: 'paragraph', count: 1, ids: ['p3']}, data: {styleId: 'Heading1'}});
// on unmount
ctx.release();
```

A stale canvas cannot overwrite the context of the current owner. `useStudioContext(activeStudio)` is what the shell and panel hosts read. `services` (booleans such as `ready`) are the way to gate sections and panels on canvas state without leaking engine details.

### 9.6 Commands

Every action in a panel is a command with an id of the form `<studio>.<name>`, with titles in en, de, es, fr and pt-BR. Panels list the ids they use in `commands`, so the palette, menus, shortcuts and the AI see the same actions. `validateStudioShell(studio, def, {commandExists, hostExists, iconExists})` reports unknown commands, hosts, icons, bad `when` expressions, rail items pointing at missing or wrong-side panels, and duplicate ids. Run it in a unit test for every studio manifest.
