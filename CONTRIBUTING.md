# Contributing

Somnia is MIT licensed. Use feature branches, keep changes focused, document them in English, and open a pull request. Do not bypass failing checks or turn a design proposal into a release claim.

## Repository map

- `phase1/`: desktop/web app, Rust host, engines, tests and developer notes.
- `docs/`: user/technical documentation and design records.
- `relay/`: collaboration relay.
- `proto/`: frozen early prototypes.

## Local development

The repository pins Rust **1.95.0**. Start with the [build/release guide](https://github.com/philppplik/somnia/blob/main/docs/BUILD-AND-RELEASE.md) and the scripts in `phase1/package.json` for the exact revision you use.

```sh
cd phase1
npm ci
npm run craft:build
npm run dev
```

Generated WASM assets are not all present in a fresh checkout. The documented aggregate build is not proof that every newer engine has been generated. Check `scripts/check-craft.mjs`, the relevant engine's build script and the release workflow when an asset is missing. Do not substitute fake WASM modules to claim a production build passed.

```sh
npm run build
npm run typecheck
npm run test:core
npm run test:e2e
npm run tauri dev
```

Desktop development also needs platform webview libraries and Tauri prerequisites. Headless Rust tests can use the documented `--no-default-features` route where supported. Test names/scripts and generated-asset requirements can change between main and a release tag.

## Before a pull request

- Explain the issue and the behavior you changed.
- Add focused tests and report exactly what ran.
- Check formatting and source diff; include license notices for third-party code.
- Inspect actual rendered UI for visual changes, not just DOM or test IDs.
- State platform and real-service gaps. A mocked browser test is not native desktop or provider/server acceptance.
- Keep secrets, private documents and user data out of fixtures, screenshots and logs.

CI must be green on the intended release commit. Use existing free-tier/public-repository workflows; do not introduce billable jobs. A passing CI run does not replace maintainer platform testing.

## Documentation changes

One topic has one technical home. Update its existing repository guide and link from the guide rather than copying long specifications into several places. Separate implemented, released, experimental and proposed behavior. Keep installer names/platforms tied to real release assets.

[Documentation index](https://github.com/philppplik/somnia/blob/main/docs/README.md) · [Architecture](https://github.com/philppplik/somnia/blob/main/docs/ARCHITECTURE.md) · [MIT license](https://github.com/philppplik/somnia/blob/main/LICENSE)
