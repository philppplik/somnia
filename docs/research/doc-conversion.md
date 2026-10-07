# Local document conversion: candidates and decision

Scope: local only, MIT/Apache/BSD only, no paid APIs. Versions/dates from npm and crates.io on 2026-10-07.

| Need | Pick | License | Notes |
|---|---|---|---|
| docx -> md/text | mammoth 1.13.0 (mwilliamson/mammoth.js @791a189) + turndown 7.2.4 + turndown-plugin-gfm 1.0.2 | BSD-2 / MIT / MIT | Semantic only: headings, lists, tables, links, bold/italic. Loses layout, code styling, images (dropped). mammoth pulls jszip (dual MIT OR GPL, we use MIT). |
| md -> docx | markdown-it (already a dep) + docx 9.9.0 (dolanmiu/docx @f41c99d) | MIT / MIT | Headings, inline styles, links, nested lists, quotes, code blocks, tables. No images, footnotes, math. |
| pdf -> txt | unpdf 1.8.1 (unjs/unpdf @19ff34d, bundles pdf.js) | MIT (pdf.js Apache-2.0) | Text layer only. Scans need OCR, not included. |
| images -> pdf | pdf-lib 1.17.1 (Hopding/pdf-lib @93dd36e) | MIT | PNG/JPEG only. Last release 2022 but stable, no deps on native code. Other formats: convert via canvas first. |
| md/html -> pdf | Not built. Use webview print-to-PDF (preview iframe + Tauri print) or pdfmake 0.3.11 (MIT) + html-to-pdfmake | MIT | pdf-lib standard fonts are WinAnsi only, so unicode text needs an embedded font. |
| docx -> pdf | Not built. docx-preview 0.4.1 (Apache-2.0) renders docx to HTML, then print-to-PDF. | Apache-2.0 | Approximate fidelity. |
| pdf -> docx | Not realistic locally with permissive code. | | pdf2docx (ArtifexSoftware, relicensed MIT, but unmaintained, Python, needs PyMuPDF which is AGPL). Best effort: unpdf text -> markdownToDocx (text only, no layout). |

Rust side (if heavy work should leave the webview): lopdf 0.45 (MIT), pdf-extract 0.12 (MIT), pdfium-render 0.9 (MIT OR Apache-2.0, needs the pdfium binary), printpdf 0.12 (MIT), docx-rs 0.4 (MIT), pdf_oxide 0.3 (MIT OR Apache-2.0, PDF -> text/markdown/html). None is needed for the TS path above.

Code: phase1/src/lib/convert/docConvert.ts, tests next to it (tsx --test).
