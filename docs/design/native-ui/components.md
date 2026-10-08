# Component contracts

[Overview](README.md) / [Tokens](tokens.md) / Components

## 1. Two meanings of "component"

Somnia has two distinct systems:

- **Application UI components:** Button, Dialog, Tabs, rails, inspectors and other React shell elements. These compose the app and use its design tokens.
- **Authoring components:** reusable HTML blocks, variants and bound fields inserted into the user's project. These are document content. They must not acquire privileged app behavior or inherit app appearance rules accidentally.

The Base UI primitives in `phase1/src/components/ui/` belong to the first system. `ComponentsPanel`, `componentSystem` and the library belong to the second. Use precise names in issues, tests and reviews.

## 2. Shared primitive inventory

| Primitive | Public surface | Implemented styling/behavior |
| --- | --- | --- |
| `Button` | Base UI Button props, `variant`, `size`, `className` | `data-slot=button`, CVA variants, `cn`, title fallback from aria-label |
| `Dialog` | Base UI Root | Controlled/uncontrolled primitive root |
| `DialogContent` | Base UI Popup props | Portal, backdrop, popup class |
| `DialogTitle` | Base UI Title | Use a real accessible title, visually hidden if needed |
| `DialogDescription` | Base UI Description | Explain purpose, not unrelated page content |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Base UI parts | `data-slot`, token-backed CSS, active-state styles |
| `Badge` | Native span props | Border, compact typography, no interactive semantics by itself |
| `Separator` | Native span props | Vertical role/orientation by default, 1 px line |

Source: [`components/ui/`](../../../phase1/src/components/ui/). The wrappers are shadcn-derived/adapted, but this is not Radix or an unmodified upstream shadcn theme. The installed primitive package is `@base-ui/react`; check `phase1/package.json` for actual versions.

### Button variants

| Variant | Treatment | Suitable role |
| --- | --- | --- |
| `ghost` (default) | Transparent, neutral hover | Toolbars, rails, secondary actions |
| `outline` | Elevated background, default border | Bounded secondary action |
| `primary` | Accent-fill background, white text | Main action within a local task |

Common states: disabled cursor/opacity, hover only when not disabled, `aria-pressed` accent-soft/accent treatment, 100 ms color transition. Global focus styles supply the visible outline. There is no shared destructive or loading variant in this snapshot. A new state must preserve label, hit target and focus, not merely add a spinner.

### Button sizes, at default zoom

| Size | Utility contract | Geometry |
| --- | --- | --- |
| `normal` (default) | `h-9 px-3.5` | 36 px high, 14 px horizontal padding |
| `icon` | `size-9 p-0` | 36 x 36 px |
| `compact` | `h-7 px-2 text-[11px]` | 28 px high, 8 px horizontal padding |
| `tiny` | `h-6 px-1 text-[10px]` | 24 px high, 4 px horizontal padding |
| `row` | `h-7 w-6 p-0`, SVG size 3 | 28 x 24 px, 12 px SVG |

Default descendant SVG size is 16 px. A component can override dimensions; shared names describe defaults, not every call site's final pixels. Tiny controls are desktop-density choices, not a claim of touch-target compliance.

### Minimal usage

```tsx
<Button
  size="icon"
  aria-label={t('cmd.edit.undo')}
  title={t('cmd.edit.undo')}
  disabled={!canUndo}
  onClick={() => void executeCommand('edit.undo')}
>
  <Undo2 />
</Button>
```

**Design requirement:** localize labels and tooltips; name the job, not the glyph. If a tooltip contains a shortcut, derive it through the shortcut system instead of duplicating a platform-specific string. `aria-pressed` is for a persistent toggle state, not a momentary action.

## 3. Dialogs and menus

A Dialog is for a bounded task with focus containment and an explicit close route. Use Title and Description. The command palette supplies `initialFocus` to its search field. Do not hand-build a modal merely to reproduce the primitive's semantics.

Generic dialog defaults: fixed popup at 12vh, centered horizontally, 560 px wide, viewport width minus 32 px maximum, backdrop blur 4 px and z-index 100/101. Specific dialogs override placement, dimensions and radius. Settings is a centered 880 x 640 px resizable grid with independent sidebar/content scrolling. It fits within the viewport margins; below 740 px its sidebar narrows to 180 px.

Application category menus use Base UI Menu with portal and positioner. Canvas/layer/tab context menus are custom components. Their accessible-role labels do **not** imply full Base UI menu behavior: the custom canvas/layer handlers focus the first enabled button and close on Escape/outside pointer, but do not implement a shared complete arrow-key roving model.

**Design requirement for new menus:** keyboard opening, up/down navigation, disabled-item handling, escape, focus restoration, viewport-safe positioning, pointer selection and appropriate separators. Avoid changing established command order when context changes; disable irrelevant commands or use a stable contextual group.

## 4. Shell, rails and panel cards

[`App.tsx`](../../../phase1/src/App.tsx) owns titlebar, the center layout and side-slot routing. The card background/radius/clipping comes from bento styles, not each editor independently.

[`IconRail`](../../../phase1/src/components/IconRail.tsx):

- Two persistent 44 px vertical rails, toolbar role and orientation.
- Toggle button first; choosing an active core panel a second time collapses it.
- Core left order: Layers, Files, Search, Components, CSS, Versions.
- Core right order: Design, Prototype.
- Extension panel entries precede core entries; extension registry changes can alter that group.
- Extensions/Settings sit at the left bottom; chat/Agent at the right bottom.
- ArrowUp/Down cycle focus; Home/End go to endpoints. This moves focus, not selection.
- Pressed state reflects the active panel and whether its side is open.

**Gap:** the rails are not yet a complete mode-aware registry. Some media editors replace side-slot content while the generic rail remains. Do not promise each visible icon always names the current raster/PDF slot.

[`ResizeHandle`](../../../phase1/src/components/ResizeHandle.tsx) is a focusable separator with min/max/current values. Arrow keys move 8 px, Shift+Arrow 24 px, with direction inverted for the inspector. Pointer capture supports dragging; release/cancel/lost capture clears the drag. A hover grip is visual feedback, not the only resizing route.

## 5. Tabs and representation controls

Document tabs are browser-like open-file entries in [`FileTabs`](../../../phase1/src/components/FileTabs.tsx). Source and media entries share a tablist but live in different state stores. Source-tab closure leaves the last source tab open; media tabs can close and run their own guards. Click/Enter/Space activates a tab. Middle-click closes. Tab context menu offers close, close others and copy path. Media dirty markers query raster/PDF state separately.

**Gap:** FileTabs is custom, not the shared Base UI Tabs wrapper, and does not implement the complete arrow-key tablist pattern. Shared panel Tabs and FileTabs should not be described as identical behavior.

Representation controls in the header choose design/split/code. Markdown relabels them preview/split/source. Raster removes the generic switcher. These are not document tabs and not edit-tool selectors.

## 6. Inspector and properties

The HTML Inspector finds the selected node, resets draft fields on node/attribute changes, exposes metrics and scoped source/style edits, and renders an empty state when no project exists. SVG routes to `SvgInspector` only for an active SVG source, a connected project, no active media and a non-code view. Raster and PDF are routed earlier by the App side slots.

**Design requirement:** no selection should mean useful document-level properties or an explicit empty state, never controls for a stale object. Multi-selection must show mixed values honestly; do not write a representative first object's value to every object without an intentional multi-edit contract. Numeric fields need units, constraints and keyboard support.

## 7. Authoring component browser

Implemented source: [`ComponentsPanel.tsx`](../../../phase1/src/components/ComponentsPanel.tsx), [`ComponentSystemPanel.tsx`](../../../phase1/src/components/ComponentSystemPanel.tsx), [`component-system.md`](../../features/component-system.md).

The browser provides built-in blocks and the user's library, category filtering, search, preview cards, variant choice, insert/replace, save selection, contextual actions and drag/drop. Scope/category survive tab switches through module state, not reload persistence.

Preview cards:

- Lazy-mount via IntersectionObserver and measure card width via ResizeObserver.
- Render the block in a sandboxed iframe (`sandbox=""`) at 960 x 640 reference dimensions, scaled into the card.
- Preview content is document content, not privileged application code.
- Hover, focus-within and selection expose actions. Do not make actions hover-only.
- Enter inserts; Shift+F10/ContextMenu opens actions; arrow navigation uses the current two-column model.
- Insert requires connected core; replace and save selection also require a selection.
- Drag transfers a component payload with copy semantics; drop/status hints identify the target.

**Gap:** the current `canWrite` predicate is `coreConnected`; it is not a complete collaboration-permission predicate. Do not infer read-only/guest protection across the app from that name. Source-specific guards and collaboration tests must establish it.

Reusable HTML variants and bound fields are explained in their dedicated guide. Use core transactions to change documents; avoid manipulating preview DOM as the saved source.

## 8. Status and feedback

[`StatusBar`](../../../phase1/src/components/StatusBar.tsx) hosts Problems, updates, collaboration, math status, storage, project name/dirty state, a polite notice region, breadcrumbs or spacer, cursor position where relevant, version, revision and viewport/zoom controls.

The storage group exposes an accessible label and `data-dirty`/`data-storage`; a green dot means disk + clean, amber otherwise. Text and the asterisk accompany color. Do not use the dot as the sole storage explanation.

**Gap:** current code hides web-specific status controls for Markdown and raster, but PDF/SVG routing is not yet fully unified. Storage text uses application state while raster/PDF dirty state also exists separately. Review every editor's save/dirty display before asserting a single cross-format status owner.

Notices can surface short failures; detailed Problems/log output remains separate. Status is not a place for continuous debug traces, bearer tokens, raw provider responses or unsanitized peer data.

## 9. Icons and copy

Use [`lib/icons.tsx`](../../../phase1/src/lib/icons.tsx), which renders Vadivam glyphs on a 24 px grid with round stroke caps/joins and default stroke width 2. Lucide-compatible exported names are compatibility aliases, not proof that the app's glyph source is Lucide. The dependency list alone does not define the visual icon family.

Decorative SVGs default to `aria-hidden`. The containing control must carry the accessible name. Do not add a second redundant screen-reader name to every glyph. Routine copy describes jobs (Save copy, Open folder, Choose another file), not internal engine names. Avoid fake availability, "soon" controls and labels whose action differs from their wording.

## 10. State matrix for every new component

Review applicable rows, including combinations:

| State | Required check |
| --- | --- |
| Idle | Label and hierarchy make sense without hover |
| Hover | No layout jump, sufficient contrast |
| Focus-visible | Visible, not clipped, not confused with selection |
| Active/pressed | Semantic state agrees with actual behavior |
| Disabled | Cannot execute by pointer, shortcut or menu bypass |
| Busy | Prevent unsafe duplicate action; preserve cancel route |
| Empty | Explain next useful action |
| Error | Keep work intact, show recovery, detailed log separately |
| Dirty | Save/close route belongs to the active document |
| High contrast | Outline, borders and text still distinguish states |
| Reduced motion/transparency | Usable without transition or blur |
| Translated/scaled | No clipped labels or unreachable controls |
