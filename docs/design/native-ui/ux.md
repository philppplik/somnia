# Interaction and UX

[Overview](README.md) / Interaction and UX / [Context](context-awareness.md)

## 1. Local-first startup and files

Implemented startup uses workflow preferences: recover the last unsaved in-memory draft when configured, start empty, or explicitly create a blank file. The starter project is development-only and opt-in for tests. It is not the normal first-run experience. Read [`main.tsx`](../../../phase1/src/main.tsx) and the workflow preference source before changing startup text.

Folder/project, source tabs and binary-media store are distinct concepts. A binary preview can be open while the application's text `activeFile` still names another document. UI code must use the active editor/media fact rather than guessing from a filename alone.

**Design requirement:** opening a file activates the right editor without a mode-selection dialog when the format is known. Unknown content must remain an honest fallback or explicit error. A recognized extension is not proof of recognized bytes.

## 2. Edit, history and save are one intent

For HTML/source, the editor core owns transactions and history. Selection, canvas and code are representations of that source, not three editable copies. `applyOperations` transacts with the current expected revision and then refreshes the store. Undo/redo goes through the owner of the active editing surface.

`markSaved(snapshot)` records the actual snapshot written. If edits happen while a save is pending, the current document must remain dirty when it differs from that snapshot. Updating only a status message is not a save implementation.

Raster scopes the shared Save/Undo/Redo/Close commands while active. PDF currently registers its own `pdf.*` commands and key listener. SVG has its own integration. These paths are not yet a single uniform document port.

**Design requirement:** never let a hidden editor consume Undo, Save or Close for a different active document. Disable mutation during a conflicting busy operation; cancellation must not discard newer work. Export fidelity, overwriting and lossy conversion need explicit format-specific handling.

## 3. Safe closure and recovery

Project close, tab close, window close and media close are separate routes. Dirty media uses registered close guards; source/project flows use their own close logic. Do not call one tested close path proof of all routes.

For new work, closing a dirty editor must offer a clear save/discard/cancel path or a safe documented equivalent. Cancel preserves content, tab, selection and history. A failed save keeps the work dirty and visible. Replacing same-name media must also honor its close guard before revoking the old object URL.

Test recovery with a disposable folder. A web preview cannot establish native disk persistence, OS dialogs, conflict behavior or native window masking. Use the [native acceptance checklist](../../../phase1/notes/NATIVE-GUI-ACCEPTANCE.md) alongside the current implementation, not as a statement that its historical plan has already passed.

## 4. Focus and keyboard

The command system translates `Mod` to Ctrl or Command. Shortcuts are editable and stored by command ID. Global dispatch ignores composition, repeated keys and already-handled events. Text inputs keep ordinary typing; commands need `allowInInput` or an explicit editor exception to run there. Settings and the palette suppress global shortcuts.

Markdown formatting is handled in capture phase for focused Markdown source: `Mod+B` formats text there instead of toggling the global sidebar. This is a scoped exception, not a global remapping. Always check focus and editor type before borrowing a common key.

Implemented landmarks:

| Intent | Default command/shortcut |
| --- | --- |
| Commands | `palette.open`, Mod+K |
| Open folder / Save | `project.open` Mod+O / `project.save` Mod+S |
| Undo / Redo | `edit.undo` Mod+Z / `edit.redo` Mod+Shift+Z; non-Mac Mod+Y alias |
| Left/right panels | Mod+B / Mod+Alt+I |
| Problems | Mod+J |
| Code / design / split | Mod+1 / Mod+2 / Mod+3 |
| Next / previous tab | Mod+Alt+ArrowRight / ArrowLeft |
| Agent | Mod+Alt+A |
| Session chat | Mod+Alt+C when a chat session exists |

Read current `listCommands()` for displayed shortcuts: user overrides and editor scopes can change them. Do not freeze a screenshot's shortcut into a tooltip. App also has a separate Ctrl/Meta+Shift+C session-chat listener; that duplication is an integration point to audit, not a recommended second command path.

## 5. Split and resize interactions

Source/design split persists orientation, swap and ratio. Pointer resizing maps position to the appropriate dimension; keyboard moves 2 percentage points, Shift moves 10. Home, Enter and double-click reset the split to its default. Orientation determines arrow keys, and swap reverses movement. Ratio stays in 15-85%.

Side panels use a separate pixel-width contract and keyboard increments. Do not mix percent and pixel ARIA values. A divider has a visible focus state, separator role, orientation and current/min/max values. Resize needs pointer-cancel and lost-capture behavior as well as successful drag behavior.

## 6. Context menus

Canvas actions use the clicked DOM node; layer actions first select the clicked node. Locked nodes disable destructive/order actions. Layer menus add actions relevant to table nodes and containers, including row/column operations and layout presets. Formatting/entity transformations in source have a separate context.

**Design requirement:** the target of a right-click action must be the object shown in its menu, not the previous selection. After a document update, resolve that object again before mutation if necessary. Closing the menu should restore focus to a sensible origin. Long menus stay within the viewport and scroll instead of hiding critical actions.

See [context-awareness](context-awareness.md) for the distinction between contextual action availability and authority.

## 7. Settings: live changes with escape routes

Settings is a searchable, grouped modal. Changes apply live, record undo callbacks, and can be reset by section; search and modified-setting views are part of the same system. AI settings are a Settings area with provider/instructions/privacy/tools tabs, not a second configuration UI in the Agent panel.

An appearance toggle must change the actual app. Persisting a value without consuming it is not done. Disabling a capability should retain a chosen value when useful, but explain why it currently cannot apply. Glass is the example: native failure/high contrast keeps an opaque result rather than pretending the preference succeeded.

Reset writes explicit v2 look defaults so a legacy look cannot return on next launch. Storage failure can make a setting session-only; that is different from a broken control. Use [Settings deep links](../../SETTINGS-DEEP-LINKS.md) for navigation mechanics instead of inventing local anchors.

## 8. Motion, scrolling and text selection

Routine motion is short: generic palette entry is 120 ms and button color transition 100 ms. UI animation preference covers specific consumers, not every duration in the code. Reduced-motion media rules remove animations/transitions; explicit full motion can re-enable selected declared transitions. Test the effective state rather than claiming every component obeys a single timing token.

Scrollbars remain visible and thin. Firefox uses `scrollbar-width: thin`; WebKit scrollbars are 8 px, transparent track, rounded thumb, stronger on hover. Scrollability must not be hidden to make a screenshot cleaner.

App chrome is not selectable document text. Body/buttons/menus/tabs suppress selection; inputs, editable content, CodeMirror content and `[data-copyable]` restore it. The design preview iframe owns its own document and is intentionally unaffected. Copyable errors and paths need an explicit route.

## 9. Accessibility and internationalization

Implemented i18n catalogues include en, de, es, fr and pt-BR. Many surfaces use `useT`, but hardcoded accessible labels and source messages still exist. Do not claim complete localization from catalogue existence.

Design requirements for new UI:

- Every icon-only button has a localized accessible name and useful tooltip.
- Focus is visible and never obscured by clipped cards, modal backdrops or tool overlays.
- Toggles expose pressed/checked state; selection and focus remain distinguishable.
- Colors are accompanied by text, shape or semantic state.
- Busy/error results use an appropriate status announcement without flooding it.
- Menus, tabs, rails and dialogs follow their relevant keyboard pattern, not generic `role` attributes alone.
- Increased font size, long translated strings and zoom do not hide save/cancel actions.
- Editing surfaces remain copyable and ordinary input shortcuts stay local.
- Reduced-motion, reduced-transparency and high-contrast states remain fully usable.

This is a review checklist, not a certification statement. The known current gaps are in [verification](verification.md).

## 10. Feedback and privacy

A short notice describes what happened and what the user can do. Detailed diagnostics remain in Problems/logging. The palette leaves unavailable commands visible with an unavailable explanation rather than executing a no-op. Failure must not turn into an optimistic success toast.

Context changes within the app do not require network calls by default. AI context transfer, collaboration and external links have separate explicit paths and privacy boundaries. Never use a selected document or a hovered card as permission to upload content, run project scripts with privileges or connect an account.
