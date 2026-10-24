# Features

Capabilities vary by release, studio and platform. This page describes the documented editor baseline; the alpha-only additions below are separate from stable 12.0.1.

## Website editing

- Design and source editing operate on HTML/CSS with shared undo.
- Layers, DOM breadcrumbs, inspector, Problems panel and command palette.
- CodeMirror-based code editor with Emmet, auto-close tags, linting, find/replace, formatting and diff views.
- Reusable components and variants, component browsing, and responsive viewport controls.
- ZIP, folder, single HTML and Markdown export.

See [Code Studio](studios/code.md) for the live-preview scope.

## Documents and media

Dedicated studios provide bounded document and media workflows, rather than full compatibility with every feature of the original authoring application. Some imports remain preview-only. Save a copy and inspect the exported file. See [Studios](studios.md).

PDF tools include annotations and AcroForm field design; XFA is view-only. Raster and vector editing have separate tools and history. Video export depends on the platform's codec support. Sound's documented export format is WAV.

## Optional workflows

- [Extensions and SDK](extensions.md): commands, snippets, themes and panels, with version-specific runtime and permission limits.
- [AI and Collaboration](ai-and-collaboration.md): reviewed AI changes and self-hosted/LAN collaboration. Cloud AI is optional and needs approved context.
- [Deploy](deploy.md) and [Frameworks](frameworks.md): new integrated publishing/framework workflows are **in development**, not verified features of the checked releases.

## Alpha additions

The [12.2.0-alpha.5 notes](https://github.com/philppplik/somnia/releases/tag/v12.2.0-alpha.5) document project-relative linked resources, local page navigation, dependency-aware live reload, ES module import chains, and Save/Close all files.

The [alpha.7 notes](https://github.com/philppplik/somnia/releases/tag/v12.2.0-alpha.7) document declarative per-studio shell layouts, Code menus from one command source, status/problem providers, studio-aware Agent context and typed command parameter forms.

Alpha.7 still lists ES module cycles, unopened text-file disk reload and media-copy saving as limits. Its macOS menu mirror has unit-test coverage only, not a macOS desktop test.

## Evidence, not guarantees

A source module or passing unit test does not prove complete native behavior. The repository contains design documents and older branch notes as well as shipped code. The [release notes](https://github.com/philppplik/somnia/releases) identify the installer scope; the [documentation index](https://github.com/philppplik/somnia/blob/main/docs/README.md) leads to technical detail.
