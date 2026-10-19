# AE2 - Advanced Export for Vector Studio

AE1 added the shared schema-driven dialog (`src/components/export/AdvancedExportDialog.tsx`) and wired Photos, Design, Documents, Sheets and Slides. AE2 wires Vector Studio, which until now only had the export side panel.

- Command `vector.export.advanced` ("Vector: Advanced export...") opens the dialog; it is listed first in the Export center's Vector group. The existing `vector.export.open` panel and the `vector.exportSvg` / `vector.exportPng` commands are unchanged.
- Fields: format (SVG or PNG), file name, export area (page, selection, content) with padding, PNG size as percent or exact pixels with aspect lock (each side up to 8192 px, the rasteriser limit; larger requests are refused instead of silently clamped), PNG background (transparent or white), metadata (SVG title and description; PNG title, author, copyright and description as tEXt chunks). Metadata is collapsed by default.
- Live preview and exact final size come from the same builder (`buildVectorExport`) that produces the download, so the preview and the saved bytes are identical.
- Presets are the shared per-studio presets (`somnia.export.presets.vector`, local, max 20).
- `injectSvgMetadata` moved to `src/lib/export/svgMetadata.ts` so Design and Vector share it; Design re-exports it.
- No new dependency, store or command permission.

Not in AE2: Sound, Video, 3D, Animation and PDF still export through their own review dialogs and the Export center.
