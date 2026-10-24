# P13 shell chrome adoption

Title header and status bar were inspected against the current shell. Header actions, menu bar, studio switcher and status-bar actions already use shared Button or shared menu wrappers. WindowControls still had bare native buttons; FileTabs close/context actions and CommandPalette search were also bare. This slice routes those through NativeButton/NativeInput, the deliberately geometry-free DS boundary.

No tab/listbox redesign: FileTabs keeps the original div tab hosts, Enter/Space, middle-close, stopPropagation on close, right-click fixed menu, existing disabled logic and source/media scope. Converting them to compound Tabs or Menu would change selection, focus, close bubbling or context-menu mechanics. CommandPalette keeps combobox/listbox active-descendant navigation and SchemaForm. Status messages keep their existing save/storage/source ownership. No notice timer, native window action or new command is introduced.

WindowControlButtons is a presentational view extracted from WindowControls. Native isTauri/system-frame gate and actual minimize/toggleMaximize/close routes stay in the host. Close still goes through the window close request and existing dirty handling. The browser fixture injects synthetic callbacks only; it does not prove native window operation.

Evidence: three render/source regressions protect browser gating, three window action labels/types/40x36 geometry, source-tab div identity and 16px close button, and combobox hooks. Two browser cases mount real FileTabs and CommandPalette plus the window view, test close without selecting another tab, keyboard action callbacks, disabled command nonexecution, enabled command once, Escape and light/dark screenshots. The title/header and StatusBar were audited, not fully mounted with app engines in this fixture. Real app/native E2E remains CI-only. Existing asserts/goldens and ratchet budgets are unchanged.

Local fixture: `/test/design-system/?shell-chrome`. No credentials, user files or native window mutation. The default gallery remains untouched apart from the optional route import.
