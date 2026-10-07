# Markdown live preview

Somnia edits `.md` and `.markdown` files as plain text with Markdown syntax highlighting and shows a read-only rendered preview next to the source. The file on disk stays exactly what you type. Nothing is converted, and the preview never writes back.

## Views

A Markdown file offers the same three view buttons as other files, labelled for Markdown:

| View | Shortcut | What you see |
| --- | --- | --- |
| Source | `Mod+1` | The editor only. The preview is not shown. |
| Preview | `Mod+2` | The rendered article only. It is read-only and has no formatting toolbar. |
| Split | `Mod+3` | Editor and preview together. |

`Mod` is Ctrl on Windows and Linux and Command on macOS. The three shortcuts also work while the Markdown editor has focus.

In Split, the preview header has a layout menu with **Side by side**, **Source above, preview below** and **Swap source and preview**. The same actions exist in the command palette as `split.vertical`, `split.horizontal` and `split.swap`. Drag the divider to change the ratio.

The preview renders the editor buffer, not the saved file, so unsaved changes show up as you type. Saving works as for every other file.

While a Markdown file is active, the controls that only make sense for HTML are hidden: the Layers panel shows "Layers are only available for HTML files.", and viewport, alignment and DOM breadcrumb controls do not apply. Switching between an HTML tab and a Markdown tab does not change either file.

## Preview updates

- Rendering starts shortly after you stop typing. The latest edit always wins; an older render never replaces a newer one.
- During IME composition the preview keeps the last result and updates when the composition ends.
- The renderer loads on demand. Until it is ready the preview pane shows `Loading preview…`. Source editing is never blocked.
- An empty file shows `Your Markdown preview appears here as you type.`
- If rendering fails, the source stays editable and the preview shows `Preview could not update` with a **Retry** button. When an earlier result is still on screen it is labelled `Last successful preview`.
- Diff split: while the diff split is open, the editor pane shows the diff instead of the Markdown source, so the formatting buttons, `md.*` commands and scroll sync do nothing. Close the diff to use them again.

## Supported syntax

The renderer is `markdown-it` with the CommonMark rules plus:

- tables, strikethrough (`~~text~~`) and footnotes (`[^1]`)
- task lists (`- [ ] open`, `- [x] done`), shown as disabled checkboxes
- heading anchors
- math, when **Render math in the Markdown preview** is on in Settings (on by default). Formulas are rendered with KaTeX, which loads on first use. If it cannot load, the preview shows a notice with a retry button and the formulas stay as plain text.

Not enabled: automatic linkifying of bare URLs, typographic replacements (smart quotes and dashes), and hard line breaks from single newlines. The preview shows what the Markdown says and nothing more. This dialect is CommonMark with these extensions, not a full GitHub Flavored Markdown implementation.

### Heading anchors

Each heading gets an `id` built from its text: lower case, punctuation removed, spaces turned into `-`. Repeated headings get `-1`, `-2` and so on in document order. A link such as `[see below](#install)` scrolls the preview to that heading.

## Formatting toolbar

The header above the editor (Source and Split views) has six buttons: **Bold**, **Italic**, **Link**, **Inline code**, **Bulleted list**, **Task list**. The `…` menu holds **Heading 1** to **Heading 6**, **Numbered list**, **Quote**, **Code block**, **Table** and **Strikethrough**.

All actions:

- act on the Markdown editor, keep your selection, and return focus to the editor;
- are one undo step;
- toggle off when the text already has that format.

Details:

- **Bold, Italic, Strikethrough, Inline code** wrap the selection. With no selection they insert the delimiters and put the caret between them. Inline code picks a delimiter longer than any backtick run in the selection.
- **Lists, Task list, Quote** apply to every selected line. If all selected lines already have the format, it is removed.
- **Headings** replace an existing heading marker instead of stacking markers.
- **Link** opens a dialog with Text and URL fields and an optional project file picker. Nothing is inserted until you confirm. Escape cancels without changes. The dialog never invents a URL and never fetches it.
- **Code block** asks for an optional language label.
- **Table** inserts a two-column table with a header row at the cursor.
- **Enter** continues a list or quote. Enter on an empty list item ends the list. **Shift+Enter** inserts a plain newline.

## Commands and shortcuts

Every Markdown action is a command and can be run from the command palette (`Mod+K`) as `Markdown: ...`. All of them can be reassigned in **Settings > Shortcuts**.

| Command id | Action | Default |
| --- | --- | --- |
| `md.bold` | Bold | `Mod+B` |
| `md.italic` | Italic | `Mod+I` |
| `md.code` | Inline code | none |
| `md.strike` | Strikethrough | none |
| `md.bullet` | Bulleted list | none |
| `md.task` | Task list | none |
| `md.number` | Numbered list | none |
| `md.quote` | Quote | none |
| `md.codeblock` | Code block | none |
| `md.table` | Table | none |
| `md.h1` to `md.h6` | Heading 1 to 6 | none |
| `md.reveal` | Reveal current preview block in source | none |
| `md.sync` | Toggle scroll sync | none |

Insert link has no command or default shortcut because `Mod+K` stays the command palette. Use the toolbar button.

Routing rules:

- `md.*` shortcuts only fire while the Markdown editor has focus and a source view is visible. `Mod+B` therefore means Bold there and keeps toggling the sidebar everywhere else.
- They run before the editor's own keymap, so `Mod+I` formats instead of selecting the parent syntax node.
- They are ignored during IME composition and while the command palette or Settings is open. Dialog text fields never trigger them.
- Save, undo and redo are the normal app shortcuts. A formatting action is one undo step.

## Scroll sync

In Split, the chain button in the preview header (`Sync scrolling`) links both panes. It is on by default and the choice is remembered. The button is hidden in single-pane views; the stored setting is kept.

- The pane you scroll drives the other one. Wheel, touch, scrollbar drag and Page Up/Down make a pane the driver.
- Positions follow Markdown blocks, not page percentages. The top visible source line maps to the block that contains it, including its fractional position, and the other way round. The bottom of one pane maps to the bottom of the other.
- Moving the caret or typing does not scroll the preview by itself. After each render the preview realigns to the source position without moving the caret.
- Resizing, theme or font changes, and images finishing to load recompute positions and keep your place.
- Turning sync on aligns the inactive pane to the pane you scrolled last, or to the source if neither was scrolled.

## Reveal in source

The preview is read-only, but you can jump from a rendered block to its source:

- Right-click a block in the preview and choose **Reveal in source**. The source selects that block's lines and takes focus, and the block flashes briefly in the preview.
- The locate button in the preview header, or `md.reveal`, does the same for the block at the top of the preview.

## Links in the preview

Links only act on a deliberate click. Nothing is opened or prefetched automatically.

| Link | Behaviour |
| --- | --- |
| `https://...` or `http://...` | Opens through the system's external link handler. |
| `#heading` | Scrolls inside the preview. |
| Relative `.md` or `.markdown` path | Opens the file in a tab if it is in the open project. Paths resolve relative to the current file, and `../` is supported. `path.md#heading` scrolls to that heading after the file renders. |
| Relative path to anything else | Not opened. A notice says the link type is not opened from the preview. |
| Relative `.md` path that is not in the project | A notice names the missing path. Nothing outside the project is read. |
| `mailto:` | Not opened from the preview. A notice appears. |
| Any other scheme (`javascript:`, `data:`, `file:` and so on) and `//host` | Removed. The link renders as plain, inert text. |

Task checkboxes in the preview are disabled. Change them in the source or with the Task list command. Footnote references and back-references stay inside the preview.

## Images

Only images that belong to the project are shown. A relative path resolves against the current file's folder first, then the project root, then by file name among the opened media. Missing images render as `[image: alt text]`. The image must be an opened image file in the project, so open or drop it first.

## Limits

- **No remote images.** `![x](https://example.com/a.png)` renders as the `[image: ...]` placeholder, with no network request. This avoids leaking that you opened the file.
- **No raw HTML.** HTML in Markdown is shown as literal text, including `<script>`, `<iframe>` and inline `style` or `on...` attributes. There is no option to turn HTML on.
- **No scripts** of any kind run in the preview, and project JavaScript has no access to it.
- **Read-only.** The preview cannot edit the file.
- **No file conversion.** Somnia does not convert Markdown to or from other formats here. WYSIWYG editing, front-matter forms, MDX and diagrams fetched from third parties are not supported.
- **Dialect.** Footnotes and heading anchors are extensions, so other tools may render the same file differently.
- **Performance.** Nothing here sets a maximum file size. Very large documents render more slowly; editing in Source is unaffected.

## Related

- [Architecture](../ARCHITECTURE.md) for security boundaries.
- [Settings shortcuts](../SETTINGS-DEEP-LINKS.md) for deep links into Settings.
- Source: `phase1/src/lib/markdownRender.ts` (renderer and URL policy), `phase1/src/lib/mdFormat.ts` (formatting commands), `phase1/src/lib/mdScrollMap.ts` and `phase1/src/components/MarkdownPreview.tsx` (preview and scroll sync), `phase1/src/components/MarkdownToolbar.tsx` (toolbar), `phase1/src/lib/commands.ts` (`md.*` commands).
- Tests: `phase1/src/lib/markdownRender.test.ts`, `mdFormat.test.ts`, `mdScrollMap.test.ts`, and `phase1/tests/markdown-live-preview.spec.ts`.
