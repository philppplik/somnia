# Studios

Somnia is a set of studios in one app. Switch with the studio pill in the header. The AI panel on the side works in every studio.

Status of each studio is **Stable** or **Pre-release** as shown in the release notes of the version you run. When in doubt, check [Releases](https://github.com/philppplik/somnia/releases).

| Studio | Works on | Technical docs |
| --- | --- | --- |
| [Code](studios/code.md) | HTML, CSS, JS, TS and other text files; design, split and code views; live preview | [Live preview](../live-preview-architecture.md), [Modes](../studios/MODES.md), [Components](../features/component-system.md) |
| [Documents](studios/documents.md) | Word-style documents | [Documents rail](../DOCUMENTS-STUDIO-RAIL.md) |
| [Sheets](studios/sheets.md) | Spreadsheets | [Schema forms](../SCHEMA-FORMS.md), [Sheets shell](../concepts/sheets-shell-rail.md) |
| [Slides](studios/slides.md) | Presentations | [Slides packages](../studios/SLIDES-PACKAGE-1.md), [Slides shell](../concepts/slides-shell-panels.md) |
| [Sound](studios/sound.md) | Audio | [Sound](../studios/sound.md), [Sound shell](../studios/sound-shell.md) |
| [Video](studios/video.md) | Timeline, trim, titles, export | [Video](../studios/video.md), [Video shell](../studios/video-shell.md) |
| [Design](studios/design.md) | Artboards, SVG | [Design QA](../studios/design-qa.md), [Design shell](../studios/design-shell.md) |
| [Vector](studios/vector.md) | Paths, shapes, layers, pen tool | [Vector studio](../studios/vector-studio.md), [Vector tools](../studios/vector-tools.md) |
| [Photos](studios/photos.md) | Non-destructive raster editing | [Photos panels](../PHOTOS-STUDIO-PANELS.md), [Photos rail](../PHOTOS-STUDIO-RAIL.md) |
| [Vibe Space](studios/vibe-space.md) | Autonomous agents with review and a board | [Vibe Space concept](../concepts/vibespace.md), [Vibe Space UI](../vibespace/ui.md), [Policy](../vibespace/policy.md) |

## Concepts shared by all studios

- **Smart open.** Opening a file routes it to the matching studio, or asks. [Smart open](../SMART-OPEN.md).
- **Modes.** Studios can offer Design, Split and Code views. [Modes](../studios/MODES.md).
- **Blank start.** Every studio can start blank. Blank documents are in memory until saved. [Blank projects](../studios/blank-projects.md).
- **Shell.** Menus, rails, panels and the header are described per studio as data. [Studio shell](../concepts/studio-shell.md).
- **Commands.** Every action is a command with an id. [UI commands](../ui-commands.md).
- **Versions (git).** [Git contract](../git/CONTRACT.md).
- **Collaboration.** [Live collaboration](../collaboration.md).

## Boundaries

What each studio is not. Taken from the release-checked wiki baseline of 2026-10-13.

| Workspace | Main workflow | Important boundary |
| --- | --- | --- |
| Code | HTML/CSS and text/code files; Design, Split, Code | Visual editing is not a universal JSX/TSX renderer |
| Documents | DOCX pages and supported text editing | Arbitrary Word layout/formatting fidelity is not guaranteed; save a copy |
| Sheets | XLSX cell/formula workflow | Not a claim of complete Excel compatibility |
| Slides | PPTX preview and supported text-run editing | Not a general slide-layout, notes or rich-text editor |
| Sound | Audio waveform, selection, processing and WAV copy export | Not a multitrack recording/mixer session |
| Video | Clip timeline, trim/split/reorder, supported titles/transitions and export | Codec support is platform-dependent; export is a rendered video, not a saved edit list |
| Design | Artboard and layer workspace (`.somdesign`) | Separate from the SVG/Vector document model |
| Vector | SVG shapes, paths, nodes and supported SVG/PNG export | Import/export is bounded, not arbitrary SVG feature preservation |
| Photos | Raster editing and experimental JPEG/PNG development | RAW development and durable Lightroom-style sidecars are not established |
| Vibespace (alpha) | Consent-gated local agent work | Computer use is preparation only, unavailable in the checked alpha |

### Opening and blank documents

File intake validates content as well as extensions. Manual studio selection can take precedence over automatic routing. Unsupported content should report a limitation rather than silently claim a conversion.

Blank creation adds a uniquely named tab; it does not overwrite a file or replace the project. Code starts with an empty page, office studios with minimal documents, Sound with a silent buffer, and Video with an empty edit list. Export/save before closing. Native dialogs, codecs and worker/WASM behavior need target-desktop verification.

### Modes

Use the **View** menu for Code's Design/Split/Code surfaces. Markdown uses Preview/Split/Source. The documented mode memory is per document and studio for the session. It does not change file contents, undo history or AI approval.
