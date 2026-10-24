# Design system: source audit and component inventory

Status: proposal, not implementation. Audit date: 2026-10-14.
Scope: shared chrome, Settings/AI Settings and all ten registered studio hosts.
Baseline: `int/shell`, commit `315d1f23a061d07215bdc60d25d3d57d756cbaab`.
Repository: https://github.com/philppplik/somnia

## Decision in one paragraph

Somnia already has a design-system foundation. Strengthen and finish it rather
than introduce a second component library. Keep the six existing `ui` primitives,
the semantic CSS/Tailwind bridge and the manifest-driven shell. Extract recurring
form, panel, menu, feedback and export chrome into small presentational components.
Keep each studio's document operations, parsing, selection, consent and undo model
in its own adapter. Consistent appearance must not mean identical editing behavior.
This inventory is one design-system slice; token redesign, governance and local-model
architecture are separate workstreams.

## Evidence boundary

- The branch was checked live and cloned at the commit above; the remote SHA was
  checked again after reading the source and had not changed.
- `App.tsx` imports shell registration for Code, Documents, Sheets, Slides, Photos,
  Design, Vector, Sound, Video and Vibe Space. `studios/hosts.tsx` maps their canvases
  and inspector fallbacks. Shell registrations, not only similarly named legacy
  inspectors, were followed when evaluating current panel reuse.
- Findings below are source evidence. No running app, rendered pixels, Windows
  session, accessibility tree, keyboard interaction or theme contrast was inspected.
  Existing screenshots/tests are evidence of coverage intent, not proof of passing
  behavior on this branch. No tests, app code, dependencies or snapshots were changed.
- Raw HTML controls are not automatically defects. Counts identify review areas;
  native inputs, selects, file pickers and high-volume canvas controls may be correct.
- Comments and concept documents are background data, not runtime truth. For example,
  the M0 comment in `lib/shell/types.ts` is older than the active wiring in `App.tsx`.

## 1. What is already reusable

All paths below are relative to `phase1/src/` unless stated otherwise.

| Layer | Existing source | Current capability and limits |
| --- | --- | --- |
| Tokens | `styles/tokens.css`, `styles/global.css`, `themes/*.css` | Semantic surface/text/accent/border variables; Tailwind `@theme inline` bridge; theme/palette and high-contrast overrides. Radius/gap variables exist. Cascade and local literals still compete. |
| Class composition | `lib/cn.ts` | Shared class composition used by button/input/badge/separator. Keep this single merge path. |
| Button | `components/ui/button.tsx` | Base UI Button + CVA; ghost/outline/primary; normal/icon/compact/tiny/row; pressed/disabled styling; title falls back to aria-label. No shared destructive/loading contract yet. |
| Input | `components/ui/input.tsx` | Native input, tokenized styles, invalid/disabled styles. Fixed h-9 default; many inspector inputs need explicit compact sizing. |
| Dialog | `components/ui/dialog.tsx` | Base UI root/title/description/portal/backdrop/popup. Layout/body/footer variants remain elsewhere. |
| Tabs | `components/ui/tabs.tsx` | Base UI compound wrapper with existing CSS classes. Some consumers still implement tab semantics themselves. |
| Badge | `components/ui/badge.tsx` | Compact span. No semantic status/tone API. |
| Separator | `components/ui/separator.tsx` | Vertical span with separator role/orientation. Horizontal use should have an explicit orientation contract. |
| Icons | `lib/icons.tsx`, `components/shell/railIconSet.ts`, `lib/shell/railIcons.ts` | Vadivam SVG layer and rail registries exist. Direct `lucide-react` imports remain in several dialogs/menus. Some studio-specific glyphs are justified extensions. |
| Shell layout | `components/shell/ShellFrame.tsx`, `components/ResizeHandle.tsx` | Shared slot/grid layout and split resizing. Preserve Code's wrapper-free compatibility requirements. |
| Panel hosting | `components/shell/SidebarPanelStack.tsx`, `components/studios/registerStudioPanels.ts`, `components/studios/hosts.tsx` | Per-studio panel definitions, explicit host allowlists, persisted studio layout. Registration checks reject drift between manifests and supplied hosts. |
| Inspector shell | `components/shell/InspectorPanel.tsx` | Shared empty state and collapsible sections, section-host registry, persisted collapse state. Field bodies still differ per studio. |
| Rail/menu/status | `components/IconRail.tsx`, `components/shell/MenuBar.tsx`, `components/StatusBar.tsx`, `lib/shell/*` | Context-aware shell and command model already exist. Do not replace them with a parallel UI command registry. |
| Primary action | `components/shell/HeroActionSlot.tsx`, `lib/shell/heroAction.ts` | Context-driven hero/split action; Base UI tooltip/menu and shared Button. A source for reusable action chrome. |
| Confirmation | `components/ConfirmShell.tsx` | Shared dialog layout, FileCard, warning/accent tone, busy-close protection and measured footer wrapping. Safety stays in callers. |
| Starter | `components/studios/StudioEmptyState.tsx` | Presentational open/create starter with busy/error states. Copy is English (`lang=en`) rather than localized. |
| Floating toolbar | `components/AnchoredToolbar.tsx` | Bounds-aware placement, no focus theft on selection, Escape dismissal and keyboard entry. Does not supply general roving toolbar navigation. |
| Settings behavior | `components/Settings.tsx`, `lib/settingsRegistry.ts`, `lib/settingsUnifiedSearch.ts` | Grouped navigation, search, modified/reset, project overrides, undo; useful reusable behavior beneath a large view. AI settings use a separate explicit-save lifecycle. |

## 2. Per-studio audit

| Studio | Current reusable parts | Remaining duplication / first useful extraction | Preserve in the adapter |
| --- | --- | --- | --- |
| Code | Shell panels, Files/Layers/Search/Components/Versions hosts, common Button and context sections | `ContextSections.tsx` has a second collapsible-section system; inspector field labels/drafts and multiple menu assemblies recur. Reuse field chrome first, not a new DOM editor. | Source/canvas synchronization, source positions, breakpoint rules, legacy Code pixels and local section-state keys. |
| Documents | `registerShell.ts` uses Pages plus newer `DocumentsPanelContents.tsx` hosts; `DocumentsPanels.tsx` imports Input | Local action/message/empty helpers, `doc-panel-*` CSS, raw find/outline/paragraph controls. Start with PanelBody, Field and InlineNotice. | Paragraph index/selection, read-only/compatibility limits and document-command result handling. |
| Sheets | Manifest panels and inspector host; canvas imports Button | `SheetsPanels.tsx` defines local `field`, `button`, Region and Facts; repeated apply/navigation/status forms. Start with Field, Button, PropertyList and PanelBody. | Formula source/target validation, replacement confirmation, selection settling, one command write, analysis revision/staleness and undo. |
| Slides | Registered shell panel/inspector hosts; canvas imports Button | `shellPanels.tsx` defines local input/button, Region, Empty, Notice and Metrics. Legacy `SlidesInspector.tsx` is also present but is not the sole current inspector implementation. | Text-run identity/source/old-text checks, UTF-8 byte limits, compatibility diagnostics and save-copy behavior. |
| Photos | Most panel views use Button; shared shell registration via `panels/hostMap.ts` | Range/value/reset rows, export popup chrome and panel summaries. `PhotosInspector.tsx` has a local Slider with explicit gesture boundaries. | Preview vs commit, gesture-coalesced undo, image coordinate spaces and engine limits. |
| Design | Button used across toolbox/layers/inspector/panels; generic shell | Numeric/color field chrome in `DesignInspectorPanel.tsx`; older NumberField in `DesignInspector.tsx`; export popup duplicates Photos' layout. | Mixed selections, unit/opacity conversion, validation, artboard state, alignment and adapter operation batches. |
| Vector | Button in inspector/toolbar/panels; shell host registration | Raw numeric/color/select fields, node/layer action rows, export summaries. Share field/action chrome, not the geometry engine. | SVG units, node-selection semantics, path geometry, unsupported SVG behavior and edit transactions. |
| Sound | Button in workspace/controls/panels/reviews; shared shell | Repeated range/value/control groups, source/selection/processing metadata and export/review notices. | Sample/time units, preview/playback, selection ranges and processing/undo lifecycle. |
| Video | Button in workspace/inspector/panels/reviews; shared shell | Numeric/range/select forms, title formatting, sequence/source rows and export progress. | Timeline/timebase, trim boundaries, audio/codec capability limits and cancellation. |
| Vibe Space | Shared outer shell and registered panels/sections | None of its non-test TSX files imports `ui/*` by the scan below; local CSS/raw controls and status/consent/review cards are a distinct UI island. Start with Button/Field/Notice/Card chrome only. | Native transport, pending state, capability checks, checkpoint identity, per-action consent and run lifecycle. |

### Reproducible source indicators

The following scan includes non-test `.tsx` files under each named component
folder recursively. Counts are literal `<button`, `<input`, `<select` occurrences,
not rendered instances or semantic defects. Code studio views also live outside
`components/studios`; its row is deliberately not called a complete Code count.

| Folder | TSX files | Raw button | Raw input | Raw select |
| --- | ---: | ---: | ---: | ---: |
| `photos` | 13 | 1 | 4 | 1 |
| `design` | 7 | 4 | 16 | 6 |
| `documents` | 4 | 22 | 6 | 2 |
| `sheets` | 3 | 14 | 6 | 1 |
| `slides` | 5 | 18 | 4 | 1 |
| `sound` | 8 | 1 | 13 | 2 |
| `video` | 9 | 1 | 24 | 4 |
| `vectorstudio` | 10 | 12 | 20 | 4 |
| `vibespace` | 17 | 81 | 17 | 5 |
| `agent` | 10 | 30 | 13 | 2 |

`Settings.tsx` alone is 2,010 lines with 16 raw button, 38 raw input and 21
raw select occurrences. Size is not a failure verdict, but it makes centralized
field semantics and section-level views especially valuable.

## 3. Concrete inconsistencies and source-level risks

1. **AI tab navigation uses the wrong count.** `components/agent/AgentSettings.tsx`
   defines four tabs but ArrowRight/ArrowLeft uses `%3` and `+2`. From providers,
   the normal forward cycle never reaches tools. Replace bespoke navigation with
   existing Tabs, retaining controlled `settingsAITab` and search-driven selection.
   Add four-tab ArrowLeft/Right/Home/End regressions before replacement. This is
   a source-level defect, not a reproduced runtime result.
2. **Menu behavior is implemented twice.** `shell/MenuBar.tsx` uses Base UI Menu
   including submenu/typeahead behavior. `shell/RailMenu.tsx` manually handles
   first focus, Escape and outside press; no arrow navigation/typeahead or explicit
   focus restoration is visible there. Unify menu chrome around the current Base UI
   dependency; keep rail positioning, command availability and action semantics.
3. **Overlay radius comes from several places.** `global.css` supplies popup/menu
   literals; `bento.css` changes generic popup/menu radius to `--r-md`; ConfirmShell
   and export popup classes have their own treatment, including `!rounded-[25px]`
   in Photos/Design export. A screenshot is needed to confirm effective appearance.
   Define separate small-control, panel and overlay intent; do not globally round
   every small field to 25px or accidentally alter the configurable window radius.
4. **Button/input styles are forked.** Sheets/Slides local strings use rounded-lg,
   padding and disabled-opacity values different from Button/Input. Vibe Space
   styles its own action family. Provide compact variants before replacing consumers;
   blind substitution with h-9 Input would change inspector density.
5. **Error colors bypass theme semantics.** Slides Notice/TextEditor and Design
   inspector errors use `text-red-600`/red border utilities, while the tokens already
   define `--danger`; the Tailwind bridge does not expose a danger alias in the
   inspected `@theme inline` line. Add semantic mapping in the token workstream,
   then use notice/field intent; contrast is unverified.
6. **Icon source policy is not fully applied.** `lib/icons.tsx` states the Vadivam
   direction; ConfirmShell, Save/Close dialogs, HeroActionSlot and several export/
   deployment views still directly import lucide-react. Inventory needed glyphs
   before substitution and preserve deliberate studio icons.
7. **Different commit modes are real requirements.** Design numeric drafts commit
   on Enter/blur and show validation/mixed state; Photos sliders preview and end
   a gesture; AI settings save explicitly; normal preferences apply with undo.
   A shared visual field must not silently convert these to on-change writes.
8. **Localization is uneven.** Current registered Slides panels use localized text,
   while older inspector fallbacks, StudioEmptyState and parts of AgentSettings use
   English strings. Audit reachable fallback paths and localize shared copy once.
   Do not label all of Slides untranslated based on its legacy file alone.

## 4. Proposed inventory and existence status

`Keep` means a reusable component already exists. `Extract` means related behavior
exists but its shared presentation contract is not exported. `Add` means no shared
wrapper was found in the inspected UI directory; it does not mean the underlying
Base UI package lacks the capability.

### Primitives

| Component | Status / starting point | Minimum contract |
| --- | --- | --- |
| Button | Keep `ui/button` | Existing sizes/variants; explicit button type; add reviewed destructive/loading appearance without invoking commands. |
| Input / Textarea / NativeSelect | Keep Input; Add other shared wrappers | Compact/normal size, invalid/read-only/disabled, pass-through refs/events and native semantics. Avoid custom select unless interaction needs it. |
| Checkbox / Switch / RadioGroup | Add wrappers around native/current Base UI options | Label association, keyboard behavior, checked state; distinguish boolean preference vs selection action. |
| Range / Progress / Spinner | Extract range styling; Add common progress presentation | Value/units and accessible names; determinate vs unknown progress; reduced-motion support. No fake percentage. |
| Tabs / Separator / Badge | Keep; extend small intent APIs | Controlled tabs; explicit separator orientation; neutral/info/warning/danger/success badge intent with text. |
| Menu / Tooltip / Popover | Extract from existing direct Base UI consumers | Shared portal/positioner/surface, keyboard/focus behavior, collision handling, no application state ownership. |
| Dialog / AlertDialog surface | Keep Dialog; Extract alert treatment from ConfirmShell | Title/description, busy dismissal policy, return focus and documented overlay styling. |
| Icon / IconButton | Keep icon source; Extract label/size convention over Button | Required accessible name for icon-only controls, optional tooltip; no duplicated button implementation. |

### Composites

| Component | Status / candidates | Buildable boundary |
| --- | --- | --- |
| Field + FieldMessage | Extract Settings/Design/Sheets/Slides patterns | Own label/description/error ids and layout only; child control and validation remain supplied. |
| NumberField + UnitField | Extract Design validated field | Draft string, mixed state, parser result, Enter/blur/Escape contract; parser/units supplied by studio. |
| RangeField + ValueReadout | Extract Photos/Sound/Video | Supplied onPreview/onCommit/onCancel; include pointer-cancel cleanup; no universal engine transaction. |
| ColorField | Extract Design/Vector patterns | Native picker + typed value, invalid/mixed/none display; format normalization stays supplied. |
| PanelBody / PanelHeader / Section chrome | Extract InspectorPanel/Region/ContextSection | Shared padding/title/collapse visuals; continue existing host registry and persistence adapters. |
| PropertyList | Extract Sheets Facts / Slides Metrics / Vibe metadata | Label/value rows, wrapping, units, tabular numerals and copyable values. |
| InlineNotice / Empty / Loading / Error | Extract local Message/Notice/Empty helpers | Explicit severity and live-region policy, retry callback if supplied; do not expose raw sensitive errors by default. |
| SearchField / SearchResults | Extract Settings and panel filters | Shared clear/loading/no-results presentation; actual filtering/indexes remain caller-owned. |
| Toolbar / ToggleGroup / ActionRow | Extract Markdown/selection/studio toolbars | Roving focus only where suitable, labeled groups and compact actions; avoid toolbar semantics on arbitrary form groups. |
| ExportPopoverFrame | Extract Photos + Design | Shared anchor/surface/title/body/status/actions; options, file writes, codec warnings and command execution stay local. |
| ConfirmShell / FileCard / DialogActions | Keep / Extract measured footer | Preserve busy behavior and long-label wrapping; confirmation policy and destructive action remain in caller. |
| StatusBadge / RunCard / ConsentCard surface | Extract Vibe Space and status views | Presentation and state text only; never auto-approve or widen session consent. |

### Patterns, not generic widgets

- **Studio workspace:** keep ShellFrame, rail definitions, panel hosts, InspectorPanel,
  HeroActionSlot and status slots. Studio context selects content, not a new UI tree.
- **Settings page:** SettingsSection/SettingsRow + existing registry/search/reset
  adapters. State whether a setting applies immediately or requires Save. Preserve
  project override, reset and undo behavior; never store credentials as preferences.
- **Inspector editing:** show no-selection/mixed/locked/read-only/invalid/busy states;
  adapter commits one operation batch to the current document/selection identity.
- **Async action:** show idle/pending/success/error/cancelled and stale-result guards.
  Common notice chrome does not replace studio cancellation/command/consent logic.
- **Review and consent:** show target, change, scope and revocable approval. Risky
  delete/overwrite/push actions remain individually confirmed, never session-covered.
- **Local model selection:** the new Settings > AI list can consume Field/Search/
  PropertyList/Badge/Notice primitives. Installed, reachable and capability-verified
  are separate states; this audit does not verify Ollama inference/voice/vision/tools.

## 5. Extraction sequence and acceptance gates

1. Capture reachable shell/Settings/studio states at the baseline before visual
   changes. Enumerate existing legacy fallbacks; do not delete one solely because
   a newer inspector has the same name. Freeze Code's current shell snapshots.
2. Fix the four-tab AI keyboard defect in a separate implementation change with
   regression tests. Introduce compact field and semantic notice contracts first.
3. Pilot PanelBody/PropertyList/Field/Button in current Sheets and Slides panel
   hosts. Preserve test ids, command payloads, write confirmations and error states.
   Review before/after pixels and keyboard behavior, not just class-string diffs.
4. Extract Photos/Design export chrome and range/number fields only after their
   transaction/gesture tests protect commit, Escape, pointer cancel and undo count.
5. Migrate Documents/Vector/Sound/Video forms, then Vibe Space presentation and
   Settings section views. Keep Vibe transport/consent modules out of `ui`.
6. Record each component's states, consumers and intentional exceptions in a small
   catalog; new consumers reuse it or document why native/domain controls differ.

Required checks for future implementation: light/dark/named themes, high contrast,
UI density/scale, reduced motion, long German labels, keyboard-only operation,
focus return, disabled/read-only/mixed/no-selection, busy/cancel/error/stale states,
per-studio switch persistence, copyability and native Windows behavior. Render and
inspect actual pixels before calling a migration complete.

Existing gates to retain include `tests/studio-shell-snapshot.spec.ts`,
`tests/shell-rails-inspector.spec.ts`, `tests/rail-keys.spec.ts`,
`tests/menu-submenus.spec.ts`, `tests/a11y.spec.ts`, `tests/themes.spec.ts`,
`tests/settings-redesign.spec.ts`, `tests/settings-modified.spec.ts`,
`tests/hero-creative.spec.ts`, `tests/save-close-dialogs.spec.ts` and each studio's
existing unit/end-to-end suites. Tests were located, not run. Never remove assertions,
weaken thresholds or refresh snapshots merely to make a component rewrite pass.

## 6. Source ledger and open verification

Primary source is the live repository at the pinned baseline. Source groups used:

1. `phase1/package.json`: current Base UI/CVA/Tailwind-related dependency choices.
2. `phase1/src/components/ui/*.tsx`: exact six exported primitive implementations.
3. `phase1/src/styles/{tokens,global,bento}.css`: semantic variables, theme bridge,
   literal controls, overlay cascade and global focus/selection behavior.
4. `phase1/src/App.tsx`, `components/studios/{hosts,registerStudioPanels}.tsx` and
   each studio's `registerShell.ts`: current routes and shared shell adoption.
5. `components/shell/{ShellFrame,SidebarPanelStack,InspectorPanel,MenuBar,RailMenu,
   HeroActionSlot}.tsx`, `IconRail.tsx`, `StatusBar.tsx`: current chrome and context.
6. `components/{Settings,ConfirmShell,ContextSections,AnchoredToolbar}.tsx` and
   `components/agent/AgentSettings.tsx`: shared patterns and keyboard/commit evidence.
7. Current studio panel/inspector/export files named in the tables above, including
   `documents/DocumentsPanelContents.tsx`, `sheets/SheetsPanels.tsx`,
   `slides/shellPanels.tsx`, `design/DesignInspectorPanel.tsx`,
   `photos/PhotosInspector.tsx` and `vibespace/VibeSpacePanels.tsx`.
8. `phase1/tests/*.spec.ts` and colocated shell/studio unit-test paths: coverage
   inventory only, not test results.

Unverified: effective visual cascade, contrast, actual import reachability of every
legacy subview, complete keyboard/accessibility conformance, engine-backed field
behavior, desktop/native fallbacks and performance of a migrated component set.
No new external design-library claims were needed for this repository-only audit.
