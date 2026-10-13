# Photos hero action: Export

Status: concept, no code.

## Hero action

**Export**, icon `Download`, top right where Publish sits now. One click opens an export popover anchored to the button (not a full dialog), so the photo stays visible.

## Why

The job in Photos ends with a developed copy. Lightroom treats Export as the closing step of the workflow. Today export is a section inside the right-rail `ExportPanel`, which is hidden unless the rail item is open. Publish (SSH deploy) means nothing for a photo.

## UX

- Popover content: format (PNG, JPEG), quality slider for JPEG, a one-line note "Your original is never overwritten", and a primary `Export copy` button. Uses the same engine limits as the panel and shows its errors inline.
- Remembers the last format. `Enter` exports, `Esc` closes.
- Keyboard: `Mod+Shift+E`, also shown in the tooltip. Check against existing shortcuts before adopting.
- Disabled with tooltip "Open a photo to export" when no developable photo is open, and while the engine is busy or the crop tool is active. Follows `enabled` of the command.
- Unchanged photo (`isNeutralPhoto`): still allowed, the popover notes "No edits yet, this exports an unchanged copy."
- Chevron menu: `Export as PNG`, `Export as JPEG` (one-click, no popover), `Publish...`.
- The right-rail Export panel stays and calls the same code path, so there is one export implementation.

## Reuses

- `photos.export` (`{format:'png'|'jpeg'}`, calls `exportPhotoCopy`). The one-click chevron entries are this command with a fixed format.
- `ExportPanel` logic (working state, notes) factored into a shared hook used by panel and popover.
- `deploy.open` for Publish in the menu.

## Needs

- New command `photos.export.open` (level `ui`) that opens the popover; the hero action points at it. `photos.export` stays the automation entry (agent, MCP).
- JPEG quality: `exportPhotoCopy` currently takes only the format. Confirm whether quality is supported by the engine; if not, ship the popover with format only and add quality later.
- i18n keys in 5 locales, tests for enabled/disabled states and keyboard.

## Effort

Small: about 0.5 to 1 day on top of the shell slot. Risk is low.

## Open questions for Philipp

1. Popover (proposed) or the modal export dialog style used by Project > Export?
2. Should Export also offer "Save to folder next to original"? Not proposed now.
