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
