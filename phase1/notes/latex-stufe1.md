# LaTeX Stufe 1 (math in Markdown, .tex preview)

Scope: KaTeX math in the Markdown preview, `.tex` syntax highlighting, and a math-only preview for `.tex`. No PDF compile, no packages, no BibTeX.

## Files
- `src/lib/mathExtract.ts` - finds `$..$`, `$$..$$`, `\(..\)`, `\[..\]` before Markdown escaping. Skips code spans and fences, treats `\$` as a dollar sign, keeps price-like dollars as text. Pure, no KaTeX.
- `src/lib/mathRender.ts` - lazy KaTeX loader (separate chunk, CSS and fonts included), render cache by (source, display mode), error detection, status store.
- `src/lib/markdownRender.ts` - `renderMarkdownEx` extracts math first, renders blocks, then fills formulas in.
- `src/lib/texPreview.ts` - `.tex` body renderer (sections, itemize/enumerate, equation/align/gather, text styles). Everything else is skipped and listed.
- `src/lib/mathProblems.ts` - formula errors for the Problems panel and the editor gutter (only once the engine is loaded).
- `src/lib/languages.ts` - `.tex` StreamLanguage.
- `src/components/MediaPreview.tsx` - preview wiring, 150 ms debounce, skeletons, retry, notice bar.
- `src/components/MathPill.tsx` - status bar pills.

## Safety
KaTeX options: `throwOnError:false`, `output:'html'`, `strict:'ignore'`, `maxSize:50`, `maxExpand:1000`. `trust` is a function that always returns false and records the refused command, so `\href`, `\url`, `\includegraphics`, `\htmlClass` show "is disabled in Somnia (security)". `\input`, `\include`, `\write` in `.tex` are never run, only listed.

## Known limits
- The Markdown preview is not an iframe in this build, so KaTeX CSS and fonts load with the lazy chunk instead of being injected into a sandbox frame.
- A failed chunk load can be cached by the browser for the session. The retry button tries again; if the browser refuses, reload Somnia.
- `align` gets one equation number for the block. `\label`/`\ref` are not supported (Stufe 2).
- Vite emits woff, woff2 and ttf for KaTeX; only woff2 is used by modern WebViews.
