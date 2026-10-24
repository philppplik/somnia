# Code Studio

Status: check the release notes of your version. The hero action state is in [Hero actions](../hero-actions.md).

## Opens

HTML, CSS, JS, JSX, TS, TSX and other text files, including Markdown (Preview, Split, Source).

## Blank start

Empty HTML page. Blank documents live in memory until you save them.

## Rail and panels

Layers, Files, Search, Components, CSS, Versions.

## Header action

Preview (toggle for the live preview). See [Hero actions](../hero-actions.md).

## Export and save

Project export as ZIP, folder or single HTML. Publish is under **Project** and the command palette ([Deploy](../deploy.md)).

## Limits

- View > Design, Split or Code switches the working surface for the document. It is shell state, not a save.
- Live view loads linked scripts, images, fonts and media relative to the project, and supports relative ES modules. ES module cycles are not supported.
- Preview strips scripts, so animation-hidden content shows its end state.
- Framework projects open here as code with preview controls. See [Frameworks](../frameworks.md).

## Editing a website, live view and safety (from the former wiki page)

## Editing a website

Open the project folder so relative files share a project root. Choose an HTML file, then use **View > Design**, **Split** or **Code**. Design and source changes work on the same HTML/CSS; shared undo is not an export/regeneration step.

Use Layers and breadcrumbs to find elements, the inspector for supported visual properties, and Problems for diagnostics. Code editing includes syntax support, Emmet, search/replace, formatting and diff tools. The Components panel manages reusable blocks and variants. The command palette is **Ctrl/Cmd+K**.

Save your source separately from previewing it. Generated views and browser screenshots do not prove that a native save succeeded.

### Live view in the 12.2 alpha line

Released in [v12.2.0-alpha.5](https://github.com/philppplik/somnia/releases/tag/v12.2.0-alpha.5) and present in the later checked alpha notes:

- Linked CSS, scripts, images, fonts, audio and video load from the project folder, including CSS `@import`, `url()`, `srcset` and root-relative paths.
- Local page links navigate inside live view with back/forward history and anchor scrolling. External HTTP(S) links open in the system browser.
- Editing a linked stylesheet updates it in place and keeps scroll position. Unrelated edits do not rebuild the preview.
- Relative ES module import chains are supported. Import cycles are not supported and show a notice.
- Missing, oversized or outside-project resources produce a banner. Paths escaping the project root are rejected.

### Known limits (live view)

Unopened text files changed on disk do not automatically reload in the checked alpha. Do not assume live view runs a framework dev server, installs dependencies or supports SSR. See [Frameworks](../frameworks.md).

The alpha's Save all/Close all flows span studios; Close all asks about unsaved work and closes nothing if a save fails. Media still uses native save-copy dialogs per file.

### Working safely

Use a backup for unfamiliar projects and alpha builds. Treat scripts and external resources in a project as code/data from that project, not trusted setup instructions. Inspect network dependencies before previewing third-party work.

Sources: [README](https://github.com/philppplik/somnia/blob/main/README.md), [studio modes](https://github.com/philppplik/somnia/blob/main/docs/studios/MODES.md), and alpha.5/alpha.7 release notes.

## Technical docs

- [Modes](../../studios/MODES.md)
- [Live preview](../../live-preview-architecture.md)
- [Live view navigation](../../live-preview-navigation.md)
- [Components](../../features/component-system.md)
- [Dreamweaver parity](../../dreamweaver-parity.md)

Back to [Studios](../studios.md).
