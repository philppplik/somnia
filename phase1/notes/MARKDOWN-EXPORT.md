# Markdown export

Command `project.export.md` ("Export active file as Markdown") downloads the active HTML file as `.md`. Source files are not changed.

- Converter: `packages/editor-core/src/markdown.ts` (`htmlToMarkdown`, parse5). Pure function.
- Handled: h1-h6, p, strong/em, inline code, pre, links, images, nested ul/ol (with start), blockquote, hr, br.
- Dropped: script, style, head, template, noscript.
- Kept as raw HTML so nothing is lost: table, form, iframe, svg, video, audio, canvas, details.
- Text is escaped for `\ * _ ` [ ]`. Link and image URLs have spaces and `)` percent-encoded.
- Enabled only when a project is connected and the active file is .html/.htm.

Tests: 9 core tests in `markdown.test.ts`. Not done: Markdown visual editor, .md import, DOCX (later via converter), a Playwright download test.
