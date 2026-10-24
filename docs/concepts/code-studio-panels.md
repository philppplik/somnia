# Code Studio panels

The Code studio keeps the working file tree, search and replace, component library,
CSS variables/classes/breakpoints and local versions UI. Each is a separate host,
not an alias that renders whichever tab happened to be selected last.

## Additional tools

- DOM outline: filter by tag, ID or classes, reveal the engine node in source and
  select it on the canvas. Source line/column and inherited locks come from the
  parsed document. The filter persists through `usePanelState`.
- Responsive: viewport width, three presets and the existing CSS media-query editor.
- Inspector design: existing context-aware editing sections and computed box model.
- Inspector interactions: links, forms, media and accessibility attributes, plus a
  read-only inventory of event handlers. Edit or remove attributes through a
  payload-validated command and undo through editor-core. Locked ancestors and
  read-only documents block writes. Event handlers and reserved editor metadata
  cannot be written here; executable URL schemes are refused.
- Inspector source: active file, line/character/UTF-8-byte counts, cursor and DOM outline.

`Canvas` mounts the Code command adapter and owns the Code `StudioContext` token.
Document, selection, mode, lock and engine availability are reported per change.
The shared command implementation is pure; store mutations are in
`store/codePanelCommands.ts`. Agent/MCP origins cannot run the three UI commands.

## Verification

Unit suites cover outline positions/locks, filters, interaction inventory, unsafe
attributes, UTF-8 counts, dispatcher validation, origin guards, read-only writes,
undo, stale node IDs, viewport bounds and five-language parity. Native folder and
Git backend behavior are unchanged and require desktop verification.

## Integration and local checks

The Code rail manifest spreads `codePanelShell` from `lib/codePanels/shell.ts`
into `shellV2`. `App` registers Code hosts before Documents, which shares the file,
search and version hosts. The Code rail package owns panel access and default layout.

Run `node scripts/verify-code-panels.mjs` from `phase1` for the development-only
fixture in `test/code-panels.html`. It checks attribute edits, inspector expansion,
viewport presets, DOM filtering and source reveal, then saves a screenshot. The
fixture uses editor-core without any native WASM studio. It is not a desktop test
and does not prove native Git or filesystem behavior.
