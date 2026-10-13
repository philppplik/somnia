# Settings transfer (setup files)

Status: **In development** (stage 1, branch `feat/settings-transfer`, not released).

Settings > Modified > Import & export setup saves your preferences and shortcuts as one readable JSON file and loads such a file on another machine. You review every change before it is applied, and you can undo the last import. Design reasoning: [concept](concepts/settings-import-export.md).

## What is in a setup file

| Category | Contents | Selected by default |
| --- | --- | --- |
| General and workflow | Startup, default title, delete confirmation, recovery autosave, units, image save mode | Yes |
| Code editor | Word wrap, autocomplete, tag/bracket closing, lint, Emmet, line numbers, indent, scroll, math, TeX banner | Yes |
| Typography | Document font | Yes |
| Export & publish | Strip editor IDs, keep comments | Yes |
| Shortcuts | Command ID to shortcut overrides; an empty string is an explicit unbind | Yes |

Only values that differ from the default ("overrides") are written. Stored user values are exported, not project overrides.

Never included: API keys, tokens, passwords, server or relay addresses, extension packages and permissions, AI prompts and consent, accounts, window position, recent files, sync path, documents and project data. The preview-script switch is also excluded, because it changes what code runs. Every setting must be classified (`src/lib/settingsTransfer/classify.ts`); anything unclassified is excluded, and a test fails when a new setting has no classification.

Not in stage 1: studio layouts, themes beyond the document font, update channel, extension configuration, AI preferences, project overrides, named profiles, encrypted secret transfer.

## File format

File name: `<name>.somnia-settings.json`. UTF-8 JSON, two-space indent, sorted keys, trailing newline.

```json
{
  "app": "somnia",
  "kind": "setup",
  "schemaVersion": 1,
  "scope": "user",
  "label": "Writing setup",
  "categories": {
    "settings": { "mode": "overrides", "values": { "editor.wrapLines": true, "workflow.units": "metric" } },
    "keybindings": { "common": { "project.save": "Mod+S" }, "platforms": {} }
  }
}
```

- `schemaVersion` is the file format version, separate from the app version. A newer version is refused with a clear message. Unknown categories and entries are skipped and counted, never applied.
- Limits, checked in bytes before parsing: 1 MiB, depth 16, 10,000 entries. Duplicate keys, `__proto__`, `constructor`, `prototype`, control characters and invalid Unicode are refused. No schema or URL in a file is ever fetched.
- Older files are still read: the legacy settings file, the plain shortcut object and `somnia-sync.json` v1. They open as a Merge preview. An old file never resets values it does not mention.

## Importing

1. Choose a file. Nothing is written yet. Cancel does nothing.
2. The review lists each row with current value, incoming value and a status: Add, Change, Same, Reset or Conflict. Untick rows or whole categories to leave them out.
3. **Merge selected** (default) changes only what the file contains. **Replace selected** also resets modified settings and shortcuts that the file omits, but only inside the categories you ticked, and you must confirm the reset count first.
4. A shortcut that is already used by another command, or used twice in the file, is a Conflict. It is skipped unless you choose "use it and unbind the other command".
5. Apply saves a restore point, then writes settings and shortcuts. If any write fails, every write is rolled back to the restore point. If the rollback itself fails, Somnia says so.
6. If your settings change between preview and apply, the import is refused and you review again.

**Undo last import** restores the saved values. Restore points hold only the transferable settings and shortcuts. Somnia keeps the latest 10 within 10 MiB, in local storage on this machine.

## Limits

- A restore point is stored in the browser or webview local storage. Clearing site data removes it.
- Linked sync folder: an imported setup is part of your settings, so the next "Sync now" can copy it to the folder. Sync is not paused during import yet.
- Shortcut collisions are checked against your overrides in the file and on this machine, not against built-in defaults that you have not changed.
- Per-platform shortcut overrides (`platforms`) are not read yet; such entries are skipped.
- Desktop and web use the same file picker and download. Native save dialogs and Windows/macOS behavior are not verified yet.

## Technical map

| File | Role |
| --- | --- |
| `phase1/src/lib/settingsTransfer/classify.ts` | Default-deny classification, coverage report |
| `.../strictJson.ts` | Bounded, duplicate-key-safe JSON reader |
| `.../format.ts` | Build and parse setup files, legacy adapters |
| `.../plan.ts` | Merge/Replace plan, conflicts, target revision |
| `.../apply.ts` | Restore point, transactional apply and rollback, restore, retention |
| `.../host.ts` | State patch and restore-point storage |
| `phase1/src/components/SetupTransferPanel.tsx` | Settings UI |

Tests: `npm run test:core` (`src/lib/settingsTransfer/*.test.ts`, `src/components/SetupTransferPanel.test.tsx`).
