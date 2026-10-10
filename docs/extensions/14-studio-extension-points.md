# Studio extension points (concept, proof of concept)

Status: **proposal**. Not part of `apiVersion` 1. The PoC code lives in `phase1/src/lib/extensions/studio/` and is not wired into the app yet.

Applies to: base `somnia-agent` at `1d014e1`.

## Why

Extension SDK v1 knows commands, snippets, code themes and panels. All of it assumes the Code Studio. The other Studios (Documents, Sheets, Slides, Sound, and Photos once it is registered) have no way to take part. This page proposes five extension points that work per Studio, and keeps the v1 security model.

## What this does not do

- No Studio internals are exposed. Extensions never get a document buffer, a store reference or a Studio component.
- No write access outside the Studio's own operation set.
- No network, no filesystem, no AI sidebar or agent tool contributions. Those stay closed until the policy gate in the agent architecture has an extension story.
- No catalog change. The GitHub catalog keeps rejecting `code` (worker) extensions. Everything below runs in sandboxed iframes, so it fits the catalog rule.

## Design rules

1. **Declarative first.** Inspector sections and commands are data. Code runs only where bytes must be converted (importers, exporters) or where a panel needs its own UI.
2. **The host owns the layout.** Each Studio lists the slots it exposes. A panel picks one. A Studio without a slot cannot receive a panel, and the manifest fails validation.
3. **Writes are Studio operations.** A section field maps to one operation from the Studio's allowlist. The Studio's transaction layer applies it, with one undo entry.
4. **Converters never see Studio state.** An importer returns a small interchange model. An exporter receives a snapshot of it. The host builds the document and owns the save dialog.
5. **Everything is capped.** Sizes, counts and run time are enforced by the host, not by the extension.

## The five extension points

| Point | Permission | Runs as | What it does |
| ----- | ---------- | ------- | ------------ |
| `importers` | `studio.import` | hidden sandboxed iframe | Turns bytes of an extra file format into an interchange model |
| `exporters` | `studio.export` | hidden sandboxed iframe | Turns a snapshot into bytes of an extra file format |
| `inspectorSections` | `studio.inspector` | data (or read-only iframe `html`) | Adds a section to the Studio inspector for given selection kinds |
| `commands` | `studio.commands` | declared, handled by an iframe or section | Adds Studio-scoped commands to the palette and menus, filtered by selection |
| `panels` | `studio.panels` | sandboxed iframe | Adds a panel in a host-owned slot |

### Per Studio

The table is `STUDIO_POINTS` in `points.ts`. The host owns it.

| Studio | Interchange | Panel slots | Selection kinds | Operations a section may emit |
| ------ | ----------- | ----------- | --------------- | ----------------------------- |
| `code` | `files` | `rail-left`, `rail-right`, `inspector-section`, `bottom-drawer` | element, text-range, file | the 7 existing write operations |
| `documents` | `blocks` | `rail-right`, `inspector-section`, `bottom-drawer` | caret, text-range, block, table | setBlockText, setBlockStyle, insertBlock, removeBlock, setRunStyle |
| `sheets` | `cells` | `rail-right`, `inspector-section`, `bottom-drawer` | cell, range, column, row, sheet | setCell, setRange, setFormat, insertRows, insertColumns |
| `slides` | `slides` | `rail-right`, `inspector-section`, `flyout` | slide, shape, text-range | setShapeText, setShapeStyle, insertShape, removeShape, reorderSlide |
| `sound` | `pcm` | `inspector-section`, `bottom-drawer` | track, region, cursor | applyEffect, trim, gain |
| `photos` (not mounted) | `raster` | `inspector-section`, `flyout` | layer, selection, document | setAdjustment, applyFilter, setLayerProps |

Operation names for Documents, Sheets, Slides, Sound and Photos are **assumptions**. They are chosen to match what each Studio already does, but the real Studio transaction APIs were not mapped to these names. See "Open questions".

## Panel docking without overriding Studio tools

In Photos and the vector/PDF modes the toolbox replaces the web rail. If extension panels could use rails, they would fight the toolbox for the same space. The rules:

- Extension panels never replace a rail, a toolbox or the canvas.
- Studios with a toolbox (Photos) expose no `rail-*` slots. Their panels go to `flyout` (anchored to one host-owned "Extensions" button) or to an inspector section.
- At most 4 panels per slot. The rest are listed as overflow for a "More" menu.
- Order is deterministic (qualified id, `extId.panelId`), so two extensions never reorder each other.
- Studio switch unmounts the panels of the old Studio. Panel state is the extension's own, kept through `storage`.

## Manifest sketch

Studio contributions sit in `contributes.studios`. Unknown keys inside it are rejected, not dropped.

```json
{
  "studios": {
    "importers": [
      {"id": "md-doc", "label": "Markdown", "studio": "documents",
       "formats": [{"ext": "md", "priority": 5}],
       "code": "somnia.converter.onImport(async (bytes, info) => ({kind: 'blocks', blocks: [{type: 'paragraph', text: new TextDecoder().decode(bytes)}]}));"}
    ],
    "inspectorSections": [
      {"id": "number-format", "title": "Number format", "studio": "sheets", "when": ["cell", "range"],
       "fields": [{"id": "fmt", "type": "select", "label": "Format",
                   "options": [{"value": "0.0", "label": "One decimal"}],
                   "op": {"type": "setFormat", "valueKey": "format"}}]}
    ],
    "commands": [
      {"id": "acme.kit.upper", "title": "Uppercase", "studio": ["documents"], "when": ["text-range"], "category": "Edit"}
    ],
    "panels": [
      {"id": "stats", "title": "Stats", "studio": "documents", "slot": "rail-right", "html": "<p>Words: <b id=\"n\">0</b></p>"}
    ]
  }
}
```

## Converters

The converter iframe uses `sandbox="allow-scripts"` and a CSP of `default-src 'none'; script-src 'unsafe-inline'`. That is the boundary panels already use. It matters for two reasons:

- The native app CSP conflict (Blob worker plus `new AsyncFunction` against `worker-src 'self'` and no `unsafe-eval`) does not apply. The iframe has its own CSP and the app CSP stays as strict as it is.
- The catalog rule against workers stays intact.

Protocol (JSON plus transferable `ArrayBuffer`):

```
host  -> frame  {type:'convert.run', requestId, mode:'import'|'export', payload, info}
frame -> host   {type:'convert.result', requestId, ok, value|error}
```

In the extension code: `somnia.converter.onImport(async (bytes, info) => model)` and `somnia.converter.onExport(async (snapshot, info) => Uint8Array)`.

Limits (`LIMITS` in `points.ts`): 64 MB in, 128 MB out, 30 s per run. The importer result is validated against the Studio's interchange kind and rejected whole if it does not fit.

Format claims: extension importers claim priority 0 to 9. Built-in claims use 10. When the Studio accepts a file itself, extension importers show up under "Open with", they never silently take over. For formats no built-in accepts, the highest claim wins, ties by qualified id.

## Interchange models (v1)

| Kind | Shape |
| ---- | ----- |
| `files` | `{files: Record<path, string>}`, relative paths only |
| `blocks` | `{blocks: {type: 'paragraph'\|'heading', text, level?}[]}` |
| `cells` | `{sheets: {name, rows: (string\|number\|boolean\|null)[][]}[]}` |
| `slides` | `{slides: {shapes: {type: 'text', text}[]}[]}` |
| `pcm` | `{sampleRate, channels: Float32Array[]}` |
| `raster` | `{width, height, data: Uint8ClampedArray}` RGBA |

These are minimal on purpose. Styles, formulas, masks and layers need optional fields, added without a version bump while they stay optional.

## Host wiring (not in the PoC)

1. Add the five `studio.*` permissions to `PERMISSIONS` and `contributes.studios` to `ExtensionManifest`. Call `validateStudioContributions(c.studios, id, permissions)` from `validateManifest`. Update `03-permissions.md` and the permission-revoke UI.
2. `activateExtensions` calls `registerStudioContributions` per enabled extension and disposes it on switch-off. `effectiveManifest` already strips revoked permissions, so a revoked `studio.panels` unmounts panels.
3. In `hosts.tsx`: read `slotLayout(studio)` for slot components, `sectionsFor(studio, selectionKind)` in each Studio inspector, `commandsFor` in the palette.
4. Open and Save flows ask `importersFor` / `exportersFor`, run the converter through a `ConverterPort` backed by a hidden iframe, and build or snapshot the document through the Studio.
5. Field changes go through the Studio's transaction layer, with the op allowlist from `STUDIO_POINTS` as a second check at runtime, not only at install.
6. Bump `apiVersion` to 2 only when this ships. A v1 host must reject a manifest with `contributes.studios` instead of ignoring it (today unknown `contributes` keys are dropped silently, which would make an extension look installed but do nothing).

## Open questions (assumptions)

- **Operation names** for Documents, Sheets, Slides, Sound and Photos are placeholders. They need mapping to the real transaction APIs of each Studio.
- **Photos** is not registered at `1d014e1`. Its entry is `mounted: false`, and nothing resolves for it until it is.
- **Sound interchange** as in-memory PCM is heavy: 128 MB out is about 12 minutes of 44.1 kHz stereo float. Long audio may need a chunked protocol.
- **Fidelity.** Round-tripping docx, xlsx and pptx through the minimal models loses styling. Fine for text-like formats, not for Office files. Those stay built in.
- **Commands** declared in `studios` need a handler. The PoC leaves the handler binding open: either an iframe message (panel or hidden) or a section action. Needs a decision.
- **Sandbox cost.** One hidden iframe per converter run. Reuse and warm-up are not designed.
- **Agent tools.** Extension-contributed agent tools would go through the same policy gate as built-in ones. Deliberately left out until the gate is reviewed.
- Whether `sandbox="allow-scripts"` iframes under the Tauri CSP behave as in the browser was not tested here. The existing panels use the same setup, so it is likely, but unverified.
