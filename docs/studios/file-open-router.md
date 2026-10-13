# Smart File-Open Router

Implemented on `feat/file-open-router`, based on `1db70be06e986200ede2cb94a1710456182ab3f1`.

## Intake and intent

All explicit file opens classify the original bytes locally. No network or AI classification is used.

- Windows/Linux launch arguments are captured in the Rust host, including multiple files. Existing files only, flags skipped.
- A first-registered single-instance plugin (2.4.0, MIT OR Apache-2.0) forwards later Windows/Linux launches to the existing editor. Relative arguments resolve against the launching process's working directory. The shell is shown and focused.
- macOS `RunEvent::Opened` file URLs enter the same Rust queue. Subscribe-before-drain and serialized intake cover events during renderer startup and while a chooser is pending.
- Native one-file drops use the native grant and exact bytes. Only actual directories take the folder-open path. Multi-file drops retain import-as-copies behavior, but no longer skip files by suffix.
- Browser drops pass the original `File` blob into the shared coordinator.
- Chat attachments, conversion drops and Video's add-source action retain their separate import intent.
- The visible Studio is a suggestion for ambiguous drops, never an incompatible forced target. OS opens have no target suggestion and ignore old tab overrides.

## Actual registered Studios

| Validated content | Destination |
| --- | --- |
| DOCX / word package | Documents |
| XLSX / workbook package | Sheets |
| PPTX / presentation package | Slides |
| Audio magic | Sound |
| Video container magic | Video |
| Native raster image | Photos |
| Strict-importable SVG root | Vector |
| SVG outside Vector's supported subset | Code source fallback |
| PDF | Code's existing PDF editor/preview |
| Additional raster preview formats | Code read-only preview |
| Known source/text type | Code |

There is no separately registered Writer, SVGEdit or PDF Studio in this baseline. This router uses Documents, Vector and Code rather than inventing unavailable destinations. Handler registration remains extensible.

Office ZIP directory parts, raster/PDF signatures and existing audio/video sniffers are reused. Renamed Office packages now prepare even without an Office suffix. SVG detection checks the root element, including BOM-encoded text, rather than arbitrary inline SVG in HTML. UTF-16 BOM is handled before MPEG magic to avoid mistaking `FF FE` text for audio.

## Uncertain or unsafe files

Suffix/content disagreement, tied handlers or unknown verified text show the themed dialog:

> In which studio do you want to open this file?

EN, de, es, fr and pt-BR have all dialog keys. Only registered compatible editors are offered. A compatible drop target is preselected and labelled; incompatible drop targets are not offered. Cancel/Escape/close leave the current document unchanged. The choice applies to this document only.

For damaged/unsupported binary data, the dialog reports that no installed Studio can safely read it, with Open disabled. Selecting an arbitrary editor cannot make unsafe binary input valid. Newer pending choices cancel older unanswered choices.

## Save semantics and safety

Code source selected through a native picker, OS open or single-file drop keeps the native single-file disk project and Save-in-place. Before replacement, unsaved source edits get the existing recovery/discard confirmation. The candidate is parsed first and a revision guard rejects concurrent source changes. A second byte/text read detects file changes during intake.

Non-Code documents use the same prepare/commit handlers as browser opens and leave an unrelated disk project attached. They keep their existing Studio export/save model; this change does not add Office/audio/video in-place saves.

`read_open_bytes` accepts only a native-created single-file project and that project's exact path. It cannot read unrelated files or folder projects. Existing path, symlink and size checks apply. Native classification and each media input are limited to 25 MB. Bulk drop reads are limited to 60 MB and 200 entries. No extension filter discards unknown input before classification.

## Validation

- 32 TypeScript unit/integration tests passed across resolver, coordinator, choice state and intake, including four native port regressions.
- `cargo test --no-default-features --locked`: 88 library tests, 29 file-service tests, 25 Git tests, 12 MCP tests and 4 recovery tests passed (158 total).
- Seven isolated Playwright tests passed: confirm in all five locales, Escape cancel, light/dark screenshots after animations settle. Harness uses the real dialog and shared styles, not a mocked UI.
- English light and German dark screenshots inspected: no clipping; labels, selection and footer are readable and fit the Somnia design.
- A Windows-target cross-check was attempted but stopped during dependency compilation; no Windows compile result is claimed.
- Rust desktop source parses with rustfmt. Native desktop compilation cannot finish in this environment because Linux `glib-2.0` development libraries are unavailable. The single-instance integration and macOS event code require release CI and platform checks.
- Full frontend typecheck is blocked by the baseline missing generated `slides-engine/pkg/somnia_slides.js` bridge declarations. No other TypeScript errors remain.
- Full app build requires generated WASM bridges absent from a fresh checkout. No stubs were added to production.

## Platform acceptance before release

Windows first: installed Open-with from a cold start and a running app for HTML, SVG, DOCX, XLSX, PPTX, PDF, PNG, WAV and MP4; drag the same files into a different visible Studio. Test non-ASCII and spaced paths, unknown text (confirm/cancel), renamed media, unsupported binary and multiple OS selections. Confirm native Code Save writes the selected file, not an imported copy. Somnia must not become the default app.

macOS: installed bundle Finder Open/Open With while closed and running, file URL with spaces/Unicode, delayed renderer startup, chooser pending while another open event arrives.

Linux: packaged launch with absolute and relative arguments, second launch forwarding under the desktop session, native drops. File association registration is a packaging concern; the router only handles arguments delivered by the OS.

Existing project directory locks may reject opening another selected source in the same already-locked directory. The current project must remain intact; this patch does not redesign backend project locking. The current media size ceiling remains unchanged.
