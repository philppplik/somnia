# Settings redesign, tranche 1

Base: feature/i18n e33289f. Branch: feat/settings-redesign. No merge or release.

## Implemented

- Mockup-shaped rounded two-column modal, grey sidebar, panel content, X close, 880x640 default, CSS resize with 720x520 minimum (clamped to the viewport), independent scrolling and Escape.
- Icons before every available sidebar item; App, Editor, Workflow, Power-Ups, System groups. Unimplemented categories are omitted, not disabled or labelled as future features.
- Cross-section case/accent-insensitive search with one-edit typo tolerance. Filters rows and sidebar sections; empty-result feedback. Uses the existing translator with EN/DE catalogue additions from the settings translation worker.
- Existing functional appearance/code/shortcuts/extensions/update/about controls preserved. New General language placement, actual current Canvas viewport/zoom and sandboxed preview script switch, accent presets and hex readout.
- Section resets for General, Appearance, Code, Canvas, Preview, Shortcuts and Updates. Live changes and settings-only Ctrl/Cmd+Z for app-state preferences, language, formatting, update preference and shortcut overrides. Text inputs keep native text undo. Application shortcuts are suppressed while Settings is open so document undo/delete/save cannot leak behind the modal.
- Repository docs link per section. Existing extension installation/removal is not undoable, so settings undo does not claim to reverse it.

## Verification

Typecheck and production build pass. Core suite: 272/272. Focused settings/look/shortcuts/language/extensions tests: 11/11. New redesign and about/update tests: 6/6. Broader focused run: 19 passed, 2 startup races (keyboard fired before app ready); those 2 passed on serial rerun, and new tests now wait for the UI before shortcuts.

Full 156-test run exceeded the 120-second command budget at 35 tests and was stopped. It showed 3 failures under 4-worker contention (About/update startup, component browser, component library). This is NOT a green full-suite claim. Run full CI on integration.

Actual light, dark, search and 760x560 screenshots inspected: rounded sidebar/content geometry, visible icons, readable control layout, close button and independent scrolling. Windows native mouse-resize and WebView2 not tested here.

## Remaining scope

This is the first tranche, not the complete specification. Window, Editing, Typography, Projects, Export/Publish, Oneiroi, Privacy/Security, Advanced and Account/License categories are not implemented yet. Most proposed controls in the current categories also still need real backing behavior: app startup choices/recent counts, UI font/motion/grain/shadows, canvas grid/rulers/guides/snapping/panning, code save/type formatting and font selectors, device/server preview settings, update channels/cadence/download policy, extension verification/developer mode. Canvas controls currently change the current view, not persistent defaults for new projects.

Many remaining rows describe entire systems absent from the codebase, rather than simple preferences. Account/billing/credits require owner product decisions and real services; provider keys need native OS keychain work; hosting OAuth needs real application registration; native renderer/GPU choices cannot be faked by a UI select. Do not publish dummy account pricing or fake protected capabilities.

## Integration

Fetch the bundle and cherry-pick the tranche commit onto the i18n integration branch. Settings.tsx is reformatted and restructured; do not line-merge the old Settings i18n worker's JSX version. Its supplied EN/DE keys are already included. Merge catalogue additions by key with other i18n bundles. Commands.ts has one guard added; styles are appended at end of global.css.

## Windows check

Open Settings with Ctrl+,; resize by bottom-right corner; navigate every icon; search theme/autocomplet and clear search; change theme/density/code preferences and Ctrl+Z; change language in General; reset and restart to check persisted preferences. Escape must close Settings without changing source. Check current Canvas zoom and preview script toggle against the actual view. Scroll sidebar to About on small windows.

## Tranche 2

Added real shell-only UI preferences: Inter-first vs system font stack, base UI font size (10-20px), animation duration (0-200ms), explicit reduce/full/system motion policy, panel shadow strength, remembered sidebar/inspector widths. Preferences are sanitized, persisted and restored on startup; disabling width memory deletes only the stored widths. None of these CSS rules enter project iframe documents. Fixed component-specific font sizes still take precedence over the base font size.

Added shortcut JSON export and bounded validated import (known command IDs, valid key combinations, 100KB limit). Import replaces overrides atomically after validation and is undoable. All remain under the existing Settings live/reset/undo flow.

Verification: core 276/276, interface + redesign Playwright 6/6, production build/typecheck pass. Interface screenshot inspected for control visibility and scrolling. Native/Windows panel persistence still needs user verification.

## Tranche 3

General now wires startup choice (restore local draft/welcome/blank), custom HTML document title escaped safely, and optional element-delete confirmation. Editing category wires local memory-project recovery autosave and interval (1-300 seconds), explicitly described as recovery data rather than disk saving. Code editor now has live line-number, indent-on-input and visual-selection auto-scroll switches. Existing close-with-unsaved protection is not weakened or made optional.

Found and fixed a pre-existing starter lookup bug: `.replace('htm','html')` changed `.html` to `htmll`, so New blank file produced empty text. Anchored suffix conversion now returns the actual HTML starter for both .htm and .html.

Verification: 278 core tests passed before starter regression added; new workflow e2e 2/2 passes after fix, draft restore/redesign 4/4 passed. Typecheck/build pass. Editing screenshot inspected. This tranche modifies SourceEditor.tsx (narrow preference changes), main.tsx, appStore, projectActions, structureCommands and fileOps; reconcile with encoding/media bundles.

## Tranche 4

Canvas: persistent defaults for new-project viewport/zoom, grid visibility/size/color, canvas background, selection color/border width, resize-handle visibility, double-click text editing, Shift multi-selection, Space-panning overlay and page shadow. Defaults apply when connecting a project. Shell overlay preferences do not modify HTML/CSS source. Current viewport/zoom controls remain distinct from new-project defaults.

Verification: core 280/280, Canvas/settings/DnD e2e 15/15, typecheck/build pass. Canvas screenshot inspected. Changes to DesignCanvas.tsx need merging with animation/media worker updates.

## Tranche 5

Updates now uses real stable/beta/alpha release filtering and selectable hourly/daily/weekly check cadence; the status-bar monitor reconfigures immediately, including focus checks. Pre-release updates open their GitHub download page rather than pretending the stable signed endpoint supports every channel. Update signature protection remains enforced by the existing updater and is not exposed as a disable toggle. Release-notes button added.

Extensions gains a real undoable disable-all action. Advanced gains a persistent toggle for the existing incremental parser, with honest experimental/fallback description. No fake GPU/renderer selector.

Verification: core 282/282, updated redesign/system e2e 5/5, build/typecheck pass. Updates screenshot inspected; stale legacy text about unavailable signed updater removed.

## Tranche 6

Desktop-only Window category: remembers dimensions/position, bounded default size that applies live, always-on-top, native/system vs custom frame, and custom titlebar double-click maximize/none. Actual Tauri window API calls must succeed before preferences commit; controls are disabled during the operation. Startup applies saved preferences. Added main-window-only capability permissions for always-on-top/decorations, no preview-frame privilege changes.

Core 284/284, build/typecheck pass. Browser regression settings/interface/system 8/8. Native Window layout/API integration cannot be visually verified in this environment; no Rust toolchain here. Needs desktop CI capability validation and Philipp's Windows test before release. Source includes tested injected platform-port behavior and rejection tests, not a claim of native execution success.

## Tranche 7

Typography category: safe installed-font stacks (system/serif/monospace), font size, line height, letter spacing and paragraph spacing written into new blank HTML pages, with live sample. Not an installed-font enumeration, Google Fonts integration or existing-source rewrite.

Export & Publish: real editor-data-attribute stripping and optional HTML comment removal for ZIP and single HTML downloads using parse5 tree traversal. Script strings are preserved and source remains unchanged. Folder export explicitly preserves source and does not apply these cleanups. No fake hosting/connect buttons.

Native Window application now rolls back partial platform changes if a later action fails. Panning shortcut no longer intercepts Space while Settings is open.

Verification: core 287/287, document e2e 2/2 after wiring correction; other document/workflow/redesign/export 6/6 passed. Build/typecheck pass. Typography screenshot inspected. Local font enumeration and native project backup-folder integrations remain.

## Tranche 8

Projects category: actual bounded whole-project recovery snapshots in the local app profile, retain 1-50 snapshots, automatic snapshots alongside memory-project recovery, manual snapshot, download exact original snapshot ZIP without export cleaning. Never replaces the current workspace or changes a disk project. Explicit 2 MB total budget and quota failures, older snapshots pruned. This is local-profile recovery, not native disk backup folders, crash-service backups or external-file monitoring.

Verification: core 290/290, backups/redesign/draft-restore e2e 5/5, typecheck/build pass. Projects screenshot inspected. Backups operate on the current text-file model; integrate with media worker before promising binary asset snapshot coverage.
