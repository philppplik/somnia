# Settings deep links

The Help > Keyboard shortcuts entry, command palette command and native menu
command all run `help.shortcuts`. It opens the existing Settings dialog with
`settingsSection: 'Shortcuts'` instead of posting a shortcut summary in the
status notice.

`settingsNavigationId` is a transient request counter. Incrementing it allows a
repeat deep link to clear an active search even if Settings is already open on
the requested section. It is not persisted and does not affect preferences.

Settings clears its search when opening, changing sections or receiving a new
navigation request. On the next animation frame it resets the content scroll
and reveals the active sidebar item using `scrollIntoView({block: 'nearest'})`.
The existing `aria-current="page"` styling highlights the selected section.
The shortcuts dialog description is translated in en, de, es, fr and pt-BR.

Shortcut registration, binding overrides, capture, import/export and reset
logic are unchanged.

## Verification

- `npm run build`
- `npm run test:core`: 547 tests, 544 passed, 3 skipped, none failed.
- `npx playwright test tests/help-shortcuts.spec.ts tests/shortcuts.spec.ts tests/settings-redesign.spec.ts tests/settings-interface.spec.ts tests/split-orientation.spec.ts --workers=2`: 15 passed.
- The new tests exercise Help and command palette navigation in all five
  languages, active search/scroll cleanup and repeat navigation while Settings
  is already open on Shortcuts. Existing shortcut override/import/reset tests
  remain green. The shortcut test now waits for app initialization before
  pressing Ctrl+, to avoid a startup race.
- Visual check: Settings shows the Shortcuts heading and existing controls with
  the sidebar selection visible and highlighted. Desktop-native Windows menu
  behavior is not run here; its shared command handler is exercised in browser.
