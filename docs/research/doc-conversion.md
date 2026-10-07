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

## Implemented document facade (feature/convert-doc)

`src/lib/conversion/documents.ts` exposes `convertDocument({from,to,data,title?,password?,signal?})` and returns `{data,mimeType,extension,warnings}`. Its supported pairs are md -> pdf, pdf -> txt, pdf -> docx, docx -> md. No files are written, no user files are uploaded, no remote images or fonts are fetched. The UI must show the returned warnings before the user saves the converted copy.

- md -> pdf uses pdfmake **0.2.20, MIT**, with bundled Roboto **Apache-2.0**. Embeds fonts; headings, emphasis, lists (including nested), quotes, code and basic tables are rendered on A4. Images are replaced by explicit labels. Math is source text; unsupported scripts/emoji may not render. Runtime library and font license copies are in `phase1/public/licenses/`. Sources checked: https://github.com/bpampuch/pdfmake and https://github.com/googlefonts/roboto-2/blob/main/LICENSE.
- pdf -> txt uses the research module's unpdf **1.8.1, MIT** (PDF.js **Apache-2.0**). Extraction is sequential, with a 1000-page and 8 Mi-character limit, cleanup and cooperative cancellation. Uses local bytes only, not a URL. Resource settings disable eval/system-font use and cap images. Source: https://github.com/unjs/unpdf.
- pdf -> docx uses the extracted text, with docx **9.9.0, MIT**, to create real OOXML paragraphs and page breaks. This is text reconstruction, NOT original Word layout, tables, images, fonts, or guaranteed reading order. Scanned pages produce explicit OCR-missing warnings, not invented text.
- docx -> md delegates to the research module. Browser compatibility fixes use Mammoth's bundled browser entry and ArrayBuffer input, disable external file access and embedded style maps, never inject Mammoth HTML into the app DOM, and restrict emitted link schemes. Mammoth **1.13.0 BSD-2-Clause**, Turndown **7.2.4 MIT**, GFM plugin **1.0.2 MIT**. Images/layout/advanced Word features are not preserved.

Facade limits: 32 MiB input; DOCX central directory checked before inflation, rejecting ZIP64/multivolume/encrypted entries, missing document.xml, excessive entries, and >64 MiB declared uncompressed size. These are best-effort limits, not a hostile-document sandbox. ZIP metadata can lie. Heavy library calls still run in the webview; cancellation cannot preempt a synchronous parse. A worker/native isolated process with a wall-clock timeout is recommended for hard hostile-input guarantees.

Mammoth's dependency tree includes CLI argparse/sprintf-js. `npm audit` on 2026-10-07 reports three moderate entries for that chain (sprintf precision denial of service) plus one existing KaTeX low entry. Browser conversion uses the prebuilt Mammoth browser entry, not CLI parsing. No forced downgrade was performed. Audit advisory: https://github.com/advisories/GHSA-hp3w-g68c-fv3c.

Validation: 12 conversion node:test cases pass; `tsc --noEmit` passes; full core suite 1065 pass, 3 skip, 0 fail. Vite production conversion harness and headless Chromium completed all four conversions with UTF-8 German text. Generated A4 PDF visually inspected: headings, marks, nested lists, quote, code, table and image omission label are readable with no overlap. Native Windows/macOS Tauri runtime and file-save UI remain the central builder's integration checks. No separate print dialog path is added.
