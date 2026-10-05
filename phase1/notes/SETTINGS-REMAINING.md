# Settings implementation: remaining scope after eight tranches

This is a progress inventory, not a claim that every original row works.

| Category | Implemented | Remaining |
| --- | --- | --- |
| General | startup draft/welcome/blank, language EN/DE/system, new document title, delete confirmation | recent-project limits/list, Canvas Tab navigation, template/example updates, macOS full-screen menu |
| Appearance | themes, accent presets, density, scale, base UI font/size, motion policy/duration, shadows, panel memory | scale 80-150 extension, actual bundled Inter, grain/aurora |
| Window | desktop size/position, size defaults, pin, frame, dblclick | native execution/visual verification; multiple windows/project tabs policy; macOS traffic-light layout |
| Canvas | viewport/zoom defaults and current controls, grid/size/color, selection color/width, resize handles, dblclick, Shift select, Space pan, background, shadow | zoom levels/speed/around pointer, rulers/units, smart guides color/toggle, snapping/distance, nudge, hover outline, drag opacity, page background |
| Editing | recovery autosave/interval, snapshots | configurable document undo limit, disk autosave policy, new-element display/style/units/CSS naming, paste mode, component opening mode, min empty-element height |
| Typography | safe local font stacks, new-page body size/line-height/letter/paragraph spacing | native font listing/folders, Google Fonts/offline cache, anti-aliasing options, smart quotes/hyphenation |
| Code | themes, size/line-height, formatter indentation, wrap, autocomplete/bracket/tag close, lint/Emmet, line numbers, auto-indent, selection scroll | font chooser, fractional size, tab-width independent of formatting, minimap, format-on-type/save, project Prettier config, delayed visual apply/conflict policy |
| Projects | bounded local-profile snapshot count + manual/automatic/download | native folder defaults/templates/bundle format, recent list, disk backup folders, external asset watching, missing-asset check, image import compression |
| Export | exact folder export, ZIP/single/Markdown, editor-attribute stripping + comments toggle | HTML/CSS/JS minification, sourcemaps, unused CSS, reset injection, asset filenames/layout, export snapshots and native export folder default |
| Preview | actual sandboxed scripts switch | native local server/browser selection, auto-preview, LAN/cross-device sync, custom device list |
| Shortcuts | override/capture/clear/reset/import/export | named keymaps, dedicated command filter, chords/delay, Windows naming override |
| Extensions | install/enable/remove/permissions/catalog, disable-all | dev mode/log console, native extension folder, signing/trust policy, auto-update, request rate limits, verified-only and experimental filters |
| Privacy | existing enforced sandbox + extension permissions + signed updater | category UI, crash/statistics services, local-data clearing with protection, export external-resource warning, disk encryption |
| Updates | automatic check, real channels/cadence, releases, status pill, signed stable install | signed prerelease endpoint, split automatic download/install control, post-update changelog preference, server selection |
| Advanced | incremental parsing | actual native GPU/renderer/memory/cache/log controls, config/log folders, devtools UI; proposed Vello/parallel-Rust/React compiler are new engines |
| Account/License/Oneiroi | omitted | Waiting on owner choices and actual services. Do not ship invented price/license/credits/account UI. |
| About | version/license/source/dependencies | brand logo/credits layout, build hash/channel, verified support/privacy/imprint links |

## Continuation order

1. Integrate the eight bundles on the builder's current branch and run full CI; resolve overlaps in Settings, main/appStore, SourceEditor, DesignCanvas, projectActions/fileOps/exportProject.
2. Verify native Window behavior and capabilities on Windows. No native-success claim until then.
3. Continue local/editor functions as focused feature commits: code font/indent/save-format, Canvas guide/nudge, export minification with parsers, native backup folders.
4. Keep source-of-truth security protections intact. Do not create a switch that disables update signature checking or erases unsaved work without a protected flow.
5. Product/service rows stay out pending the owner's answer relayed by main. Provider keys need OS-keychain integration; paid/account/hosting services are separate real workflows.

## Engineering cleanup

Settings.tsx grew as the functional rows landed. Extract each category into its own component plus a typed search registry before adding much more. Current search is token/one-edit matching, not Fuse.js; it filters actual rendered rows. Locale changes rerun search. Undo is local to an open Settings session; text controls use native undo, some resets group multiple records, and extension installs/removals are not reversible through Ctrl+Z. These are known scope differences, not full spec compliance.

Local snapshot total budget is 2 MB of JSON text with oldest-first pruning, text project model only. Snapshot downloads bypass export cleaning to preserve original contents. Binary media integration must be reconciled before backup coverage is expanded.
