# Code Studio

Status: check the release notes of your version. The hero action state is in [Hero actions](../hero-actions.md).

## Opens

HTML, CSS, JS, JSX, TS, TSX and other text files, including Markdown (Preview, Split, Source).

## Blank start

Empty HTML page. Blank documents live in memory until you save them.

## Rail and panels

Layers, Files, Search, Components, CSS, Versions.

## Header action

Preview (toggle for the live preview). Pre-release on the hero branches, see [Hero actions](../hero-actions.md).

## Export and save

Project export as ZIP, folder or single HTML. Publish is under **Project** and the command palette ([Deploy](../deploy.md)).

## Limits

- View > Design, Split or Code switches the working surface for the document. It is shell state, not a save.
- Live view loads linked scripts, images, fonts and media relative to the project, and supports relative ES modules. ES module cycles are not supported.
- Preview strips scripts, so animation-hidden content shows its end state.
- Framework projects open here as code with preview controls. See [Frameworks](../frameworks.md).

## Technical docs

- [Modes](../../studios/MODES.md)
- [Live preview](../../live-preview-architecture.md)
- [Live view navigation](../../live-preview-navigation.md)
- [Components](../../features/component-system.md)
- [Dreamweaver parity](../../dreamweaver-parity.md)

Back to [Studios](../studios.md).
