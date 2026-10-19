# AE2 - Advanced Export for PDF

One dialog over the PDF exports. Three real outputs, no placeholders:

- **Editable copy**: exactly what Save copy writes (the current edited bytes, text, forms and comments intact), with a name of your choice. Allowed for signed, encrypted and XFA files.
- **Flattened copy, print**: the existing flatten pipeline (`exportPrintInWorker`): no rasterising, text and vectors kept, annotations and forms baked into the pages. Optional metadata: title, author, subject, keywords.
- **Flattened copy, screen**: the same pipeline with JPEG pages (72-300 dpi, quality 10-100%). Lossy: text search and links are lost. Same optional metadata.

Details:
- Command `pdf.export.advanced` ("PDF: Advanced export...") is listed first in the Export center's PDF group. It is registered with the open PDF and enabled while the document is loaded and not busy. Save copy and its shortcut are unchanged.
- Saving goes through `savePdfBytes`, factored out of `exportPdfCopy` (native `pdf_save_pick` / `pdf_save_write` grant, or a browser download). `src-tauri` is not touched. File names end in `-edited`, `-flattened` or `-screen`.
- A flattened copy is a separate file. It never clears the open document's unsaved state. If the document changes while the copy is made, nothing is saved. Pipeline warnings (for example lost interactivity) appear in the editor's error banner after saving.
- Signed, encrypted and XFA files cannot be flattened; the dialog says so and the editable copy still works.
- Not offered, because the pipeline refuses them: PDF/X, linearising, font subsetting, metadata on the editable copy.
- No preview or size estimate.
