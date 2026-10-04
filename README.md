# Somnia

Local-first visual web editor and Dreamweaver successor. Design canvas, code editor, split view, themes and an extension SDK. MIT licensed.

Status: alpha. Windows builds are tested by the maintainer; Linux and macOS builds come from CI and are untested. Installers are unsigned.

## What it does today

- Visual canvas and code editor on the same source, with shared undo. Edits in either place change the real HTML and CSS; nothing is regenerated.
- Layers panel (drag and drop, keyboard alternative), DOM tree, breadcrumbs, inspector, Problems panel.
- Code editor with Emmet, auto-close tags, linting, find and replace, Apply formatting (Prettier, loaded on demand), encode/decode special characters.
- Diff viewer for last saved vs current text or any two files.
- Project menu: open folder or file, save with new-folder option, export as ZIP, folder, single HTML file or Markdown.
- Themes, 25 px rounded bento layout, extension SDK (see `docs/extensions/`).
- Local first: files stay on your machine, no account, no telemetry.

Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md). Benchmarks: [phase1/notes/BENCHMARKS.md](phase1/notes/BENCHMARKS.md).

## Download

Get installers from [Releases](https://github.com/philppplik/somnia/releases) (each release lists SHA-256 checksums).

## Repository layout

- `phase1/` - the app (Tauri + web frontend), tests and design notes (`phase1/notes/`)
- `docs/` - documentation; `docs/extensions/` is the extension SDK guide. The project site (`index.html`) also lives here.
- `proto/` - early prototypes

## Develop

```
cd phase1
npm ci
npm run dev        # web dev server
npm run test:core  # unit tests
npm run bench      # editor-core benchmarks
npx playwright test
```

## Contributing

Work in feature branches and open a pull request. CI must be green.

## License

MIT, Copyright Philipp Paulik. See `LICENSE`.
