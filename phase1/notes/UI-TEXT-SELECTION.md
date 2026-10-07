# Native chrome text selection

Somnia's own chrome now uses `user-select: none` and `-webkit-user-select: none`.
The body-level rule covers portalled Settings dialogs and top-navigation menus
as well as panel labels, tabs, status text, buttons and dialog copy.

Selection remains enabled for inputs, textareas and contenteditable surfaces
(including CodeMirror). The sandboxed design preview owns a separate document
and does not receive the shell rule. Button, menu-item and tab controls explicitly
remain non-selectable even when placed inside copyable content.

Use `data-copyable` on a content element that a user should be able to select
and copy, not on the whole panel. Existing source/proposal/variant diffs,
agent conversation text and error details opt in. The Copy error report action
still writes the redacted report through the clipboard API; its button label
is chrome, not report content.

## Verification

- `npm run build`: passed.
- `npm run test:core`: 544 passed, 3 skipped, 0 failed.
- 29 focused Playwright regressions: passed, using local Google Chrome with
  one worker. Covers Settings, About/report clipboard, code clipboard/context
  menu, diffs, agent panel, layer menus, file tabs, cursor status and accessibility.
- Four new tests in `tests/ui-selection.spec.ts` cover actual mouse drags over
  Settings and a top-navigation menu, editable source and inputs, textarea and
  copyable-content exceptions, and Copy error report clipboard output.
- Inspected Settings and Project-menu screenshots. Settings search has a
  visible selected value; shell labels retain their normal appearance.

Desktop WebView2/macOS WebKit behavior was not exercised in this Linux browser
run; both prefixed and standard CSS declarations are supplied. The full E2E
suite was not completed in the bounded local run.
