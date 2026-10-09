# Blank projects

Every studio can create a local document without opening a file picker. Creation adds a uniquely named tab; it does not replace the current project, existing media, or a file on disk. Names are checked case-insensitively across text and media tabs. Nothing is uploaded or written to disk by creation.

## Built-in documents

| Studio | Initial document | Editing and persistence |
| --- | --- | --- |
| Code | Empty HTML body, using the existing page preferences | Existing source/visual editing and project save |
| Documents | A4 DOCX with one empty paragraph | Existing on-page caret and save-copy flow |
| Sheets | XLSX with one empty worksheet | Existing cell/formula editing and export-copy flow |
| Slides | 16:9 PPTX with one empty text box | Existing text-run inspector and save-copy flow |
| Sound | One second of silent stereo PCM16, 48 kHz WAV | Existing sample-buffer editing and WAV export; this is a silent buffer, not a multitrack session |
| Video | Zero-clip edit-list project | Add source clips, edit the timeline, then export a video; no artificial black source video is generated |
| Photos | Transparent 1280 × 720 PNG | Existing raster editor and image save/export |
| Vector | Empty 1280 × 720 SVG | Existing SVG editor, or a registered native Vector factory |
| PDF | One blank A4 PDF page | Existing PDF editor |

A blank slide has no sample copy. Its empty text run can be filled from the Slides inspector. Blank Sound uses a nonempty silent buffer because the current engine edits audio samples, not a zero-track recording session. A blank Video project is not a video source and is never passed to the decoder. Export stays unavailable until it has clips. Reset returns that project to an empty timeline, and its final clip can be deleted.

Video projects live in memory. Their edit lists are not persisted by video export; export produces the rendered video. Save/export before closing, as with the existing studio workflows. Native file-picker, codec, worker and WASM behavior must be exercised on the target desktop build.

## Integration API

`createBlankProject(studioId: string): Promise<void>` is exported from `phase1/src/lib/studios/blank.ts`. It rejects generation, intake and unsupported-studio failures. Concurrent calls for the same studio share one operation. The creation path does not read an external document or open a picker. Lazy module loading follows the normal application bundling path.

`BlankProjectButton` has props `{studioId: string; className?: string; label?: string}`. The default label is `Create blank project`; the test ID is `${studioId}-create-blank`. It disables itself while creating and shows failures inline with `role="alert"`. Other CTA implementations must provide equivalent busy and error handling when calling the function.

Native studios register `registerBlankProjectFactory(studioId, factory)` during module initialization. A factory has signature `() => void | Promise<void>` and owns creation in its native document store. Registration returns an unregister callback and rejects duplicate registrations. A registered factory overrides the built-in path. Design must register its artboard/JSON factory; it must not use a PDF as a substitute. The Vector studio can register its shape/path document factory instead of the generic SVG document. Dependency loading is deferred until creation to avoid module-initialization cycles.

`VideoCanvas` and any generic media viewer must render `VideoWorkspace` for both `video` and `video-project`. Only `video` items appear as source-clip choices. The generated `video-project` tab is an edit-list owner, not an exported file format.

## Checks

The local unit tests cover package detection, empty content, editable slide-run round trips, name collisions, silent WAV structure, and empty Video sessions through add, export, delete and reset. Structural package checks are not proof of native rendering fidelity. Full studio UI checks require generated WASM bridges and a browser with the relevant codecs.
