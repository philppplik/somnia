# LaTeX math in Markdown and .tex files (Stage 1)

Somnia uses KaTeX to preview formulas in Markdown and `.tex` files. You can edit LaTeX source and check its math without leaving the editor. Stage 1 is a math preview, not a LaTeX compiler: it does not produce a PDF or reproduce a document's page layout.

## Quick start: Markdown

Open a `.md` or `.markdown` file and switch to Preview or Split. In Split, edit the source alongside the rendered result. Math rendering is on by default.

```markdown
# A short proof

Inline math: $a^2 + b^2 = c^2$.

An alternative inline delimiter: \(x_1 + x_2\).

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

An alternative block delimiter:

\[
E = mc^2
\]
```

### Delimiters and literal text

| Form | Delimiters | Preview |
| --- | --- | --- |
| Inline | `$...$` or `\(...\)` | A formula within the paragraph |
| Block | `$$...$$` or `\[...\]` | A centered formula; scroll horizontally if it is too wide |

Block formulas may span several lines, but keep each opening and closing delimiter within the same paragraph, with no blank line inside the formula. Separate formula blocks with a blank line.

For single-dollar inline math, the opening `$` must not be followed by whitespace. The closing `$` must not be preceded by whitespace or followed by a digit. Write `$x + y$`, not `$ x + y $`. These rules leave price-like text such as `5 $ and 7 $` and `$5 or $10` unchanged. To make a dollar sign explicitly literal, write `\$`.

Math inside Markdown code spans and fenced code blocks stays literal. For example, the code span `` `$x^2$` `` displays the source, not a formula.

## Quick start: a .tex file

Open a file with the `.tex` extension. The code editor selects LaTeX highlighting automatically. Switch to Preview or Split to see the pane labeled **Math preview**.

```tex
\documentclass{article}
\usepackage{amsmath}
\begin{document}
\section{A simple example}
The result is \textbf{exact}: $a^2 + b^2 = c^2$.

\subsection{Steps}
\begin{itemize}
\item Write the formula.
\item Check the preview.
\end{itemize}

\begin{equation}
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
\end{equation}

\begin{align*}
a &= b + c \\
d &= e + f
\end{align*}
\end{document}
```

The preview renders the body between `\begin{document}` and `\end{document}`. If there is no `\begin{document}`, it previews the whole file. Comments beginning with an unescaped `%` are omitted from the preview.

### What the .tex preview shows

- Paragraphs and inline or block math using the same delimiters as Markdown.
- `\section`, `\subsection` and `\subsubsection`, with automatic heading numbers. Starred forms, such as `\section*{Title}`, omit the number.
- Basic text styles: `\textbf`, `\textit`, `\emph`, `\textsl`, `\texttt` and `\underline`.
- Bulleted `itemize` and numbered `enumerate` lists, including nested lists.
- `equation`, `align` and `gather` math environments, including their starred forms. Unstarred environments get a number on the right; starred forms omit it. An `align` or `gather` block gets one number for the whole block, not one per row.

Other commands are left out and listed below the preview as **Not shown:**. For example, `\usepackage{amsmath}` can appear there. This means the package declaration was not executed; supported math commands work through KaTeX without loading a LaTeX package. It is not a package-installation error.

The notice bar says **Math preview, no PDF compile. Page layout, packages and \cite are not executed.** Choose **Dismiss** to hide it for the current session. The status bar keeps the **Math preview (no compile)** reminder.

### Editing .tex source

Comments, commands, `\begin`/`\end` and math have separate syntax highlighting, using your current code theme. With automatic bracket closing enabled in the code editor settings, braces and dollar delimiters can close automatically. Highlighting is an editing aid: a highlighted command or environment is not a promise that the preview supports it.

Save `.tex` files like other text files in Somnia. Saving uses UTF-8; previewing does not rewrite the source or create a PDF.

## Find and fix math errors

A broken formula does not stop the rest of the page from rendering.

- Inline errors appear as red source chips. Hover over a chip for the full error message.
- Block errors show the formula source and a short message in a red block.
- The status bar shows **Math: N errors**. **Math ✓ 0 errors** means the formulas in the active preview rendered without errors, not that the whole document compiled successfully.
- Open the Problems panel to find entries beginning with `Math:`. Each entry includes the file and line. Click it to jump to the source line. Editor gutter markers also indicate diagnostics when linting is enabled.

Line numbers start at the formula's opening delimiter and use the parser's position when available. They are a guide to the formula, not an exact character selection. Open the preview first to load the math engine; formula diagnostics become available after it loads. Stage 1 limits math diagnostics to 50 entries per file and skips them for source text longer than 600,000 characters.

An unclosed `$$` or `\[` is treated as text and reported as a warning after the engine loads. Close the delimiter before the next blank line. The preview does not consume the rest of the document as one unfinished formula. Warnings are separate from the status bar's formula-error count.

## Commands blocked for safety

Formulas are for displaying math, not for creating links, fetching files or changing the preview's HTML.

| Command examples | Behavior and reason |
| --- | --- |
| `\href`, `\url` | Refused in formulas. Math cannot create a link or use a URL through these commands. |
| `\includegraphics` | Refused in formulas. Math cannot load an image through this command. |
| `\htmlClass` and other KaTeX commands requiring trust | Refused. Formula source cannot inject custom HTML attributes or styling through these commands. |
| `\input`, `\include`, `\write` in .tex source | Never executed. They are omitted and listed rather than reading another file or performing a write. |

A refused KaTeX command produces an error such as `\href is disabled in Somnia (security)`. Use Markdown's normal link syntax outside a formula when you want a link in a Markdown document. There is no setting to enable trusted commands in math.

Somnia also limits formula size and macro expansion to reduce excessive work from unusually large or recursive expressions. These limits can reject expressions that a full LaTeX compiler would accept. The preview is not a way to run TeX commands, shell commands or document scripts.

## Settings

Open **Settings > Editor > Code editor**. The English labels are:

| Setting | Default | Effect |
| --- | --- | --- |
| **Render math in the Markdown preview** | On | Turn it off to keep Markdown formulas as source text instead of rendering them. This switch does not disable the .tex math preview. |
| **Show the notice bar in the .tex math preview** | On | Controls the no-compile notice bar. It does not change which commands are supported or remove the status bar reminder. |

These settings apply immediately. Their labels follow the UI language: English, German, Spanish, French or Brazilian Portuguese. If you dismissed the .tex notice bar, it remains dismissed for that session even if its setting is on.

## Loading and troubleshooting

KaTeX, its CSS and fonts are bundled with Somnia and loaded on first use. Markdown without formulas does not load the engine; opening the .tex math preview does. The engine is reused for the session and does not need an external math service. The Markdown preview uses Somnia's rendered preview pane, not a separate sandbox iframe.

During the first load, placeholders appear at formula positions while the surrounding text remains visible. A loading message and status indicator disappear when the formulas are ready. Edits update the preview after a short delay, about 150 ms; unchanged formulas reuse cached results.

If the engine cannot load, Somnia shows formulas as source, reports the failure and offers **Try again**. If retry keeps failing, reload Somnia: the browser or WebView may retain a failed module load for that session. Retrying cannot fix invalid LaTeX source; use the Problems message for that.

Formulas carry an accessible label containing their LaTeX source. This is not MathML-based spoken math. Colors follow the active theme; oversized block formulas scroll rather than wrap.

## Stage 1 boundaries

- No `pdflatex`, Tectonic or other full-document compile, and no PDF output.
- No package execution or installation, BibTeX, bibliography generation or `\cite` resolution.
- No page layout, pagination, document-class layout or print-fidelity preview.
- No `\label`/`\ref` cross-references. Preview equation numbers are local display numbers, not a compiler's reference system.
- Only the text structure and math described above are supported. Unknown commands may be omitted from .tex prose or reported as errors inside formulas.
- No automatic loading of other source files or images through TeX commands.

Use a separate LaTeX compiler when you need a final typeset document. A clean Somnia math preview confirms that supported formulas render; it does not validate the full document for that compiler.
