# Photos studio: side and inspector panels

Photos registers its panels through `registerStudioPanels('photos', {panels, sections})` (`src/components/photos/panels/registerShell.ts`). The manifest `src/lib/studios/photos.ts` stays pure data and carries `shellV2: photosShell`. Rail data is owned by `src/lib/photos/shellRail.ts` (see `PHOTOS-STUDIO-RAIL.md`). The panel contract is `docs/concepts/studio-shell.md` section 9.

## Panels

| Id | Side | Content |
| --- | --- | --- |
| `histogram` | right | Luma / RGB / R / G / B histogram of the preview render, clipping and brightness stats, clipping hint. Measured on the preview (up to 1024 px), not the original file. |
| `light`, `color`, `effects`, `detail` | right | Sliders per section with a changed marker, per-section reset, drag as one gesture. |
| `transform` | right | Crop on/off, aspect presets (free, original, 1:1, 4:3, 3:2, 16:9, 5:4, 3:4, 2:3, 9:16), straighten, rotate, flip, output size. |
| `presets` | right | Built-in looks and user presets. User presets are kept in `localStorage` through `panelStateStore`. |
| `export` | right | PNG / JPEG copy with the export limits spelled out. |
| `history` | left | Session edit history with undo, redo and jump to any step (50 steps). |
| `info` | left | File, size, edit summary, engine state. |

Extra rail items for `histogram`, `presets` and `export` are appended in `photos.ts` (order 5, 60, 70). B's rail items are unchanged.

## Commands

`src/lib/photos/panelCommands.ts`, registered at canvas mount (ref-counted): `photos.getState`, `photos.getHistogram` (read); `photos.setAdjustment`, `photos.resetAdjustments`, `photos.applyLook`, `photos.rotate`, `photos.flip`, `photos.crop.start|apply|cancel|reset|setAspect`, `photos.undo`, `photos.redo`, `photos.history.jump`, `photos.export`. Edit commands are ui-level: agent and MCP origins are refused. Slider drags use the session gesture API so one drag is one history entry.

## Verified

Unit tests (histogram, crop aspect, presets, history log, commands, panel manifest, locale parity, empty state rendering), `check:ui-commands`, `check:commands`, `tsc`. A Playwright spec (`tests/photos-panels.spec.ts`) runs the panels against a fake Worker; it does not exercise real LightCraft rendering.

## Not verified

Real engine output, native and Windows behavior, export through a real save host, `check:layers` in the authoring environment.
