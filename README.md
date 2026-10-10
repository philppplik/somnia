<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/logo-mark-white.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/logo-mark-black.svg"><img src="docs/assets/readme/logo-mark-black.svg" alt="Somnia logo" width="72"></picture></p>

# Somnia

Local-first visual web editor and Dreamweaver successor. Design canvas, code editor, split view, themes and an extension SDK. MIT licensed.

Status: alpha. Windows builds are tested by the maintainer; Linux and macOS builds come from CI and are untested. Installers are unsigned.

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
npx playwright test
```

## Contributing

Work in feature branches and open a pull request. CI must be green.

## License

MIT, Copyright Philipp Paulik. See `LICENSE`.
