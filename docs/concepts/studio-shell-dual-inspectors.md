# Studio shell: two useful sides for dense studios

Status: proposal only. No implementation or release is authorized by this document. Development starts only after Philipp reviews the concept.
Baseline: `int/shell` at `09498bbb16cdc1d4dd901b9cbfc198d688ebbf20` (inspected 2026-10-14). Paths below are relative to the repository root unless stated otherwise.
Scope: shared shell design with a Photos-first pilot. [Studio tool roadmaps](studio-tool-roadmaps.md) gives separate concepts and Adobe references for all ten studios, plus the separate raster editor. Code keeps its existing layout.

## 1. Recommendation

Yes: use both sidebars as equal panel containers, with different default jobs. Left answers **"What am I working with?"** (tools, structure, sources). Right answers **"How does the selection look or behave?"** (properties, adjustments, output). Neither side is restricted to navigation or to one large inspector.

This is mostly an extension of the existing shell, not a new frame. `SidebarPanelStack` already renders registered panels on either side. Photos already has independent adjustment panels. The missing pieces are a deliberate per-studio arrangement, support for more than one generic inspector definition, safe placement persistence, and a layout that does not squeeze the canvas.

Do not render the same full inspector twice. Two copies would duplicate controls and state, not reduce density. Divide responsibilities into panels with stable ids and one owner for every control.

The default should be useful without customization. Moving an eligible panel to the other side is an optional refinement, not a prerequisite for the Photos pilot.

## 2. Verified current state

The old `docs/concepts/studio-shell.md` is useful background and documents the panel contract in section 9. Its opening status and several implementation notes describe an earlier baseline. The source at the SHA above takes precedence for this inventory; statements of approval inside repository prose are not treated as owner approval.

### 2.1 Shared shell

| Area | Current behaviour | Consequence |
| --- | --- | --- |
| `phase1/src/lib/shell/types.ts` | `PanelDef.side` is fixed; panels may be `rail` or `docked`. Rails distinguish panel, tool and command. `movable` exists on rail items. | Both sides can already host real controls. `movable` alone does not implement cross-side movement. |
| `phase1/src/lib/shell/railResolver.ts` | Resolves availability, user order, pinning, hiding and overflow. Context-hidden items stay hidden even when pinned. | Keep this pure resolver; it is not a panel-placement manager. |
| `phase1/src/store/railActions.ts` | One overrides record per studio; edits are scoped to the item's existing side. `move` reorders within that side. | No current "move panel to other side" operation. Global uniqueness of rail ids should be validated, not merely assumed. |
| `phase1/src/components/shell/SidebarPanelStack.tsx` | Both sides support multiple open panels, collapse, close and reorder. A single expanded panel bypasses the stack chrome. Stacks and panel bodies can both scroll. | Reuse it; address nested scroll and focus before increasing the number of visible controls. |
| `phase1/src/components/shell/InspectorPanel.tsx` | Every `shell.inspector` host reads the studio's single `shellV2.inspector`, regardless of panel id. Collapse state is keyed by studio and panel id. | A second generic inspector currently repeats the same sections. Named definitions need an explicit contract. |
| `phase1/src/components/studios/registerStudioPanels.ts` | Registers allowlisted panel and section hosts and checks them against the manifest. | Extend the existing registry contract, rather than importing components into data manifests. |
| `phase1/src/store/shellLayoutStore.ts` | `somnia.shellLayout.v1` stores widths, open flags, ordered panel ids, active ids, collapsed ids and rail overrides per studio. Sanitization removes wrong-side ids and clamps widths (left 220-380, right 280-400). | Moving a manifest panel across sides without migration can erase its saved open state. |
| `phase1/src/store/panelStateStore.ts` | Persists panel-local JSON UI state separately. | Placement must not change identity or reset local expansion/filter state. Document edits do not belong here. |
| `phase1/src/components/shell/ShellFrame.tsx`, `ResizeHandle.tsx`, `App.tsx` | Two fixed-width side slots around a canvas with a 180px grid minimum; communication is an additional sibling. App has a 960px minimum width and 600px minimum height. | Two wide inspectors plus Agent can leave an unusable canvas. A responsive policy is not implemented by the existing minimums. |

### 2.2 Studio inventory

All registration paths below are under `phase1/src/components/`; manifest paths are under `phase1/src/lib/`.

| Studio | Current left | Current right | Default and registration |
| --- | --- | --- | --- |
| Photos | History; Info in overflow | Histogram, Light, Color, Effects, Detail, Transform, Presets, Export, all independent panels | Left closed; Histogram + Light open right (260/320px). `studios/photos.ts` composes `photos/shellRail.ts` and `photos/panelManifest.ts`. Hosts: `photos/panels/registerShell.ts` and `hostMap.ts`. |
| Vector | Files, Layers, Tools, then Select/Node/Pen and overflow shape tools | Generic inspector (Page, Transform, Style, Nodes) and Export | Layers left, Inspector right (260/300px). `studios/vector.ts`; `vectorstudio/registerShell.ts`. |
| Video | Files, Sources, Sequence; Add title command in overflow | Generic inspector (Source information, Selected clip, Audio and transition, Export copy) | Sources left, Inspector right (260/320px). `studios/video.ts`; `video/registerShell.ts`. |
| Sheets | Workbook, Files, Search, Analysis; Versions in overflow | Cell inspector, Formula builder, Export copy command | Workbook left, Inspector right (260/320px). `studios/sheetsRail.ts`, `sheets/panels.ts`; `sheets/registerShell.ts`. Formula builder also appears as a collapsed inspector section. |
| Raster | Transform/selection tools and transform controls | Internal tabs for Adjust, Filter, Layers, History, Info, experimental Develop | Not a separate registered studio in this inventory. `RasterEditor.tsx` owns both panels; `App.tsx` overrides the normal side stacks while raster is active. Must be adapted, not assumed to be Photos. |
| Design | Files, Layers, Artboards, Colours, overflow Search/Versions, canvas tools | Generic inspector (Selection, Arrange, Artboard, Project) | Layers left, Inspector right (268/320px). `studios/design.ts`; `design/registerShell.ts`. |
| Code, reference only | Layers, Files, Search, Components, CSS, Versions, Responsive, Outline | Generic inspector | `studios/codeRail.ts` declares rail order and an Inspector default; `components/studios/code/registerShell.ts` registers panel/section hosts. Preserve this studio's controls and single-panel compatibility rendering. |

The effective Photos default is `PHOTOS_PANEL_LAYOUT` in `panelManifest.ts`, not the older Light-only `PHOTOS_DEFAULT_LAYOUT` in `shellRail.ts`. Do not accidentally wire the latter during the pilot.

## 3. Proposed arrangement

These are default homes, not claims that new editing features exist. A panel may expose only commands the studio actually supports. In particular, Photos develop must not acquire a fictional Layers panel, and Sheets must not advertise unsupported formatting.

| Studio | Left: tools and working set | Right: selection and result | Fresh-layout default |
| --- | --- | --- | --- |
| Photos | Presets, History, Info; existing crop tool entry remains discoverable | Histogram, Light, Color, Effects, Detail, Transform, Export | Presets left; Histogram + Light right. History is one rail click away. |
| Vector | Files, Layers, Tools; current drawing-tool rail entries | Shape properties: Transform, Style, Nodes; document Page and Export available separately | Layers left; Properties right. Page stays available without a selection. |
| Video | Sources, Sequence; existing source/title actions | Clip properties, Audio/transition, source facts, Export | Sources left; Clip properties right. Existing timeline stays in the canvas workspace. |
| Raster | Tools, Layers, History | Adjustment/filter controls, Transform, Info; experimental Develop stays explicitly marked | Tools left; Adjustments right. No change to operation order or preview engine. |
| Sheets | Workbook, Analysis, Files/Search; Versions in overflow | Cell inspector and Formula builder; Export remains a command | Workbook left; Cell inspector right. Do not open two formula editors by default. |
| Design | Layers, Artboards, Colours and tools | Selection/Arrange; Artboard/Project available when needed | Keep today's Layers/Inspector default until a separate Design review. |

History belongs on the left in this recommendation because it helps navigate the working state. A user can put it right later. The semantic split is a useful starting point, not a rule imposed on every studio.

For Photos, moving Presets left is the smallest concrete demonstration: choose a look on the left, refine it on the right, keep the image in the middle. It reuses a real panel and avoids inventing new image-editing capabilities.

### 3.1 Density rules

- Rail buttons open panels; panel headers collapse or close them. Do not add a second row of buttons for the same choices.
- Open a small useful set by default. Do not open every panel merely because there are two sides.
- Keep tools distinct from panels: selecting Pen activates a tool; opening Layers does not change the tool.
- A panel's data follows the current selection. Merely selecting an object does not replace the user's chosen panels or reveal a closed side.
- Keep "nothing selected", "no document", read-only and engine-busy states honest. Do not hide useful panel entry points just because their controls are temporarily disabled.
- In Sheets, use one Formula builder implementation. Its inspector entry should become a shortcut/summary, not a second simultaneous editing surface. Preserve any draft when the same builder is revealed elsewhere.
- Prefer one scrolling stack for ordinary content. A long History/Layers list may scroll internally with a bounded height; sliders and their labels must not end up in competing scroll traps.

## 4. Interaction and state

### 4.1 Studio and document changes

Persist the workspace per studio, not per document. Returning from Photos to Vector restores Vector's open panels, order, widths and collapsed sections. Changing the active photo refreshes the existing panels without overwriting layout preferences. Do not persist a selection, engine handle, document contents or adjustment draft as layout data.

`rememberPanels` already affects restoration in `appStore.ts`; extend its documented semantics consistently rather than bypassing it. Define and test the expected behaviour when that setting is off before changing startup restoration.

### 4.2 Rail click semantics

Preserve today's active-icon toggle for the pilot. With multiple open panels, mark every actually visible open panel as open and distinguish the most recently focused panel with a separate focus treatment; currently `aria-pressed` describes only the active item. A collapsed panel is still open. Clicking its rail entry expands and reveals it. Closing a panel removes it from the open stack; closing a side preserves that stack.

This needs one shared state transition, not separate divergent mutations in `IconRail`, the panel stack and app state. Restore focus to the rail entry when a panel closes. Reordering must work with the keyboard as well as drag and drop.

### 4.3 Optional move to other side

Offer "Move to left/right" in a panel header menu for eligible panels. Dragging across sides can follow later. Both actions must use the same atomic command:

1. Resolve the panel's permitted sides and reject unsupported moves.
2. Remove its id from the old open stack and insert it once in the destination.
3. Transfer its rail entry, preserve pin/hidden state and local UI state, update active ids and reveal the destination if this was an open panel.
4. Repair the source active id and return focus to the moved panel header.

There is never a copy on both sides. Global utilities (Settings, Extensions, Chat, Agent), extension-owned panels without a placement contract, and action-only buttons do not join this movement model. Do not infer mobility from `RailItemDef.movable` without implementing and validating these semantics.

The initial Photos pilot may use fixed manifest homes. Cross-side customization is a later phase and must not delay validating whether the two-side workflow helps.

## 5. Proposed shell contract changes

### 5.1 Ordinary panels first

Photos already uses ordinary `PanelDef` hosts for its adjustment groups. No generic inspector API change is needed to place Presets left and adjustments right. Prefer this route whenever a panel is a self-contained tool.

### 5.2 Named inspector groups when needed

For Vector/Video and future complex studios, add an optional named-inspector map, keeping the existing singleton as a compatibility default:

```ts
// Proposed additions, not current API.
interface StudioShellDef {
  inspector?: InspectorDef;                         // existing default
  inspectors?: Readonly<Record<string, InspectorDef>>;
}
interface PanelDef {
  inspectorId?: string;                             // only for shell.inspector
  allowedSides?: readonly ('left' | 'right')[];      // absent = fixed side
}
```

A `shell.inspector` host must resolve its actual panel definition by `panelId`, then read `inspectorId` or fall back to the existing singleton. Register and validate section hosts from both sources. Validate missing inspector references, duplicate section ids within a group, missing hosts/commands and all `when` expressions. Do not require section ids to be globally unique across unrelated groups.

Keep stable studio/panel/section persistence keys; do not include the side. An inspector group has one panel owner. Do not put the same interactive section into two groups by default. Existing Code manifests remain unchanged and use the singleton path.

### 5.3 Placement is separate from rail preference

Keep `PanelDef.side` as the default home. Add a versioned, per-studio `panelSides` override map only when cross-side movement ships. Derive effective panel sides and rail ownership before `sanitizeShellLayout`, `stackPanels`, rail resolution and same-side validation. Resolve tools' `opensPanel` to the panel's effective side, not the side of the clicked tool icon.

Do not store placement in `RailOverrides.order`. That record describes icon order, visibility and pinning, not panel location. Sanitize placement against eligible registered panels. Reject duplicate panel ids across stacks. Unknown ids and removed extensions must not crash startup.

## 6. Migration without lost preferences

A change of default side is a data migration, even before user movement exists. The current sanitizer would drop a saved Presets id from the right after its manifest home changes to left.

- Version layout storage and migrate raw records before side filtering. Preserve the old record until the new record is saved successfully; rerunning migration must be safe.
- For a valid previous Photos layout, transfer Presets to the left only if it was saved open on the right. Preserve collapsed state and rail preferences. Leave all other panel choices alone.
- If a migrated panel was active, repair both active ids. Keep an intentionally closed left side closed; show a small one-time location hint rather than unexpectedly opening it.
- Fresh installs and explicit "Reset workspace" use the new default. Existing users do not suddenly receive extra open panels.
- Keep reset scopes separate: "Reset rail" resets icon customization; "Reset workspace" resets placement, open panels and widths for this studio. Neither resets document edits or user presets.
- Save failures fall back to a working session-only layout. Corrupt or unknown-version records must not block editing or silently destroy the recoverable old record.
- Panel-local state keys stay unchanged when a panel moves. Raster's adapter needs a separate mapping for its existing `editorPanel` choices; do not reinterpret Code's saved layout as raster preferences.

## 7. Canvas budget and responsive behaviour

Desktop is the first target. The current 960px minimum is not a mobile layout promise. Use measured available workspace width after rails, gaps and communication, rather than viewport width alone.

Proposed pilot budgets, to be validated visually: 240-320px left, 280-360px right, and at least 480px for the main editing surface. Video also needs a usable timeline height; closing a side must not resize away its transport controls. Sheets needs enough visible columns and its formula area must remain reachable.

1. If the remembered widths fit, restore them.
2. If they do not, constrain effective widths to supported minima, without overwriting the remembered wide-screen widths.
3. If both sides still do not fit, show one side docked and the other as a dismissible temporary overlay when requested. Prefer the explicitly focused side; never let an automatic selection change steal it.
4. Opening Agent/Chat recalculates the same budget. Do not turn communication into a third inspector or silently save a narrower workspace preference.
5. Closing an overlay restores focus. Escape dismisses it unless an active studio operation owns Escape first (for example crop cancel). Avoid obscuring an active drag or opening an overlay mid-gesture.

No fixed window breakpoint is accepted until the prototype is checked at 960x600, 1280x720, 1440x900 and a wide desktop, with communication both open and closed, long German labels and increased UI scale. Broader phone support is out of scope for this change.

## 8. Accessibility and layout details

- Name both sides by function in the active studio, not only "Sidebar" versus "Inspector". Panel regions and rail entries retain their individual names.
- Use localized menu/header labels and tooltips in all five existing locales. Keep thin visible scrollbars.
- Every panel keeps a reachable close/collapse/move affordance even when it is the only panel. Do not add new shell chrome to unchanged single-panel Code rendering merely to satisfy that requirement elsewhere.
- Resize separators expose effective limits and values; keyboard resizing and focus indicators remain visible. Minimum control widths must agree between the store, separators and layout calculation.
- Keep rail overflow and bottom global utilities reachable at 600px height; too many vertical icons must not hide Settings or Agent.
- Panel movement is layout-only. It must not apply an adjustment, reset a selection, trigger an export or end a crop operation.

## 9. Implementation phases and acceptance gates

No phase starts before concept review. Estimates require an implementation owner and current integration baseline; this document makes no release-date promise.

### A. Photos pilot: prove the workflow

Use the existing hosts and two stack slots. Move Presets left, add the one-time saved-layout migration, and apply density/focus rules. Keep History left and Histogram + Light right. No new photo engine work, layer system or named-inspector API.

Gate: selecting a preset left and adjusting exposure right works without losing canvas space, history, crop state or saved panel preferences. Review actual light/dark screenshots at the target window sizes before expanding scope.

### B. Shared contracts and safe movement

Add named inspector resolution only where a real split needs it. Implement effective placement, versioned persistence, atomic move commands, validator/host-registration updates and keyboard alternatives. Integrate measured width budgets and communication coexistence before enabling movement broadly.

Gate: a panel moves once, stays moved across studio switch/reload, keeps local state, and can be reset without touching document data. Existing manifests and Code baselines still pass unchanged.

### C. Vector, Video and Sheets

Split existing sections by the jobs in section 3. Preserve each studio's registered commands and empty/busy/read-only behaviour. Remove duplicate formula editing surfaces. Keep Video's timeline and selection synchronization intact. Include Design only after reviewing its existing arrangement.

Gate: a user can select on the left and edit on the right with no duplicate editor, stale selection or unexpected panel switching. Do not expose unsupported commands as new features.

### D. Raster adapter and cleanup

Wrap existing raster panels/controls as registered hosts under a scoped raster layout identity. Preserve the existing provider, engine/session ownership, undo history, dirty state and crop lifecycle. Replace App's raster side override only after adapter parity tests pass. PDF remains untouched unless separately assigned.

Gate: raster and Photos remain distinct workflows; switching away and back restores the right layout without applying, losing or overwriting operations.

### Test plan

| Layer | Required coverage |
| --- | --- |
| Pure model | `railResolver.test.ts`, `layout.test.ts`, rail command tests: effective sides, wrong-side/duplicate rejection, order/pin/hide preservation, unavailable panels, tool-open targets, corrupt storage, migration twice, reset scopes. |
| Registry and hosts | Manifest validation and `registerStudioPanels`: named inspector references, missing/unused hosts, same section id in separate groups, no duplicate control ownership, old singleton compatibility. |
| Components | `SidebarPanelStack`, `InspectorPanel`: one/many/zero panels, collapse/close/focus/move, conditional sections, selection changes, scroll behaviour, no focus loss on reorder. |
| Studio workflows | Extend `photos-panels.spec.ts`, `video-shell-ui.spec.ts`, `sheets-shell-rail.spec.ts` and Vector tests: real panel/command wiring, selection edits, preset/history/crop, formula draft, empty/busy/read-only states. Fake-worker Photos tests verify shell behaviour, not LightCraft output pixels. |
| Persistence and layout | Update stale compatibility assumptions in `shell-layout-m3.spec.ts`; extend `shell-rails-inspector.spec.ts` and `studio-shell-snapshot.spec.ts`. Switch studios/documents, reload, remember-panels off, resize, Agent open, extension panel active, overlay Escape/focus and 600px rail overflow. |
| Gates | Typecheck, focused core tests, command inventory/checks, locale parity, then relevant Playwright suites. Inspect actual screenshots in light/dark; do not approve a new golden solely because CI generated it. |

The full application suites have not been run for this documentation-only proposal. No WASM or Cargo build is needed to review or apply this patch.

## 10. Risks and boundaries

| Risk | Response |
| --- | --- |
| Twice the panels, less image | Conservative defaults and a canvas budget; show only what helps the current task. |
| Two inspectors repeat controls | Named groups with one panel owner; ordinary panels for independent tools. |
| Saved open panels disappear during relocation | Migrate before the current side-filtering sanitizer, with idempotence tests. |
| Movement changes the tool or loses a draft | Separate layout from session data; one command/state owner, draft-preservation tests. |
| Raster layout leaks into Code or Photos | Scoped adapter identity; no new studio or routing change without a separate decision. |
| Nested scrolling and unreachable utilities | Height/scale checks, bounded list regions and accessible overflow. |
| Shared shell work collides with ongoing changes | Rebase the docs and re-inventory the integration branch before coding. Keep the Code visual contract and unrelated Live View/export pipelines out of the change. |

## 11. Review decision

Recommended direction: both sides are full panel workspaces, left for working set/tools and right for properties/results. Approve a Photos-first pilot with Presets/History left and adjustments right; validate the canvas budget before rolling the pattern out. Cross-side movement is phase B, not an implied existing capability.

This is a proposal for that decision, not a record that it has been made. No pushes, development changes, engine builds or release actions are part of this document patch.
