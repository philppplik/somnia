# Build, CI and release

How Somnia is built, validated and shipped. Updater internals are in [UPDATER.md](../phase1/notes/UPDATER.md), installer branding in [INSTALLER.md](../phase1/notes/INSTALLER.md), Windows Store and signing in the roadmap and decision notes.

## Local development

```sh
cd phase1
npm ci
npm run dev            # Vite on http://127.0.0.1:1420 (web build, in-memory or File System Access)
npm run tauri dev      # desktop shell, runs `npm run dev` first (needs Rust and the platform webview libraries)
npm run build          # tsc -b && vite build  -> phase1/dist
npm run typecheck
npm run test:core
npm run test:e2e       # Playwright, starts the dev server itself
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked
```

The `desktop` Cargo feature (default) pulls in Tauri. `--no-default-features` builds only the service, log and LAN host code so tests run without GTK/WebKit.

## Versioning

The release number lives in `phase1/package.json` as `somniaRelease` (`x.y.z`). Cargo and `tauri.conf.json` keep `0.1.0`. `scripts/sync-version.mjs` rewrites the `version` of all four Tauri configs from `somniaRelease` in CI, because the updater compares versions. With `--updater` it also enables `bundle.createUpdaterArtifacts` (needs the signing key in the environment). Bump `somniaRelease` to the tag before building a release; the in-app pill compares it with the newest stable GitHub release.

## Tauri configs

| File | Used for |
| --- | --- |
| `tauri.conf.json` | Base config: window `main` (frameless, transparent, 1440x900, min 960x600, drag and drop on), CSP, updater endpoint and public key, `bundle.active: false`. |
| `tauri.alpha.conf.json` | Linux bundles (`deb`, `appimage`). |
| `tauri.windows-alpha.conf.json` | Windows `nsis` (per-user, branded images, no language picker) and `msi` (WiX banner and dialog). Images in `src-tauri/installer/`. |
| `tauri.macos-alpha.conf.json` | macOS `dmg` (plus `app` when the updater archive is built). |

## CI (`.github/workflows/phase1-core-bootstrap.yml`, "Phase 1 validation")

Runs on pushes to `phase1-foundation` that touch `phase1/**` or the workflow, on pull requests, and manually. Read-only token. Jobs:

| Job | Runner | Steps |
| --- | --- | --- |
| `frontend` | ubuntu-24.04 | `npm ci`, `npm run build`, `npm run test:core`, performance report self-test, editor-core budgets (full and incremental parser), upload `validation/bench` reports (14 days), Playwright Chromium, `npm run test:e2e` |
| `native` | ubuntu-24.04 | install WebKitGTK and Xvfb, `cargo test --no-default-features --locked`, `cargo check --locked`, `sync-version.mjs`, build `deb` and `appimage`, Xvfb keyboard smoke (`scripts/native-smoke.sh`), upload bundles and GUI evidence |
| `windows` | windows-latest | `cargo test`, `sync-version.mjs`, build `nsis` and `msi`, experimental unsigned MSIX (`scripts/make-msix.ps1`, `continue-on-error`), upload |
| `cli` | ubuntu-24.04, windows-latest | packaging `npm ci`, `build:cli-engine` and `test:cli-engine`, script tests, `cargo test` in `phase1/cli`, `scripts/package-cli.mjs build` (binary plus `sidecar/engine.mjs`), smoke test of the packed binary (`somnia --version` must print `somniaRelease`), upload archive and `.sha256`. Runs on alpha tags too. No macOS build. |
| `cli-checksums` | ubuntu-24.04 | downloads the `cli` archives, writes `SHA256SUMS`, verifies it with `sha256sum -c`, uploads it |
| `macos` | macos-latest | `cargo test`, updater harness tests, `sync-version.mjs`, build `dmg` (and `app` archive with signing secrets), upload |

`.github/workflows/relay.yml` validates `relay/` separately: `cargo fmt --check`, `clippy -D warnings`, `cargo test --locked`.

Secrets: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` enable signed updater artifacts (`.sig`). Without them CI still builds unsigned installers and no updater files. Actions minutes stay on the free tier; do not add jobs that could bill.

## Release process

CI produces artifacts, not releases. A release is assembled from the artifacts of a green run on the release commit:

1. Branch work is merged by pull request; the four CI jobs must be green on the release commit.
2. Set `somniaRelease` to the new version, commit, let CI build.
3. Download the Windows, Linux and macOS artifacts and keep the signed binary and its `.sig` paired under the same basename. Existing tag-based names may be kept: `Somnia-<tag>-x64-setup.exe`, `Somnia-<tag>-amd64.AppImage`, `Somnia-<tag>-macos-<aarch64|x86_64>.app.tar.gz`, plus `.msi`, `.deb`, `.dmg` for manual installs.
   The headless CLI comes from the `cli` jobs of the same run. Each archive holds the binary and `sidecar/engine.mjs` (the agent engine, found next to the binary). Attach `somnia-cli-<tag>-linux-x86_64.tar.gz` and `somnia-cli-<tag>-windows-x86_64.zip` unchanged (the names already carry the version) and add the CLI lines to the release checksums; `SHA256SUMS` from the `cli-checksums` artifact lists exactly those two files. The updater ignores them. Install notes ship inside each archive (`INSTALL.txt`) and in [phase1/cli/README.md](../phase1/cli/README.md).
4. Generate `latest.json`: `scripts/make-latest-json.py <tag> <notes_file> <windows_dir> <linux_dir> <out_json> [<macos_dir>]`. It derives each URL from the exact signed artifact basename (including native Tauri names such as `Somnia_12.2.0_x64-setup.exe` and `Somnia.app.tar.gz`), rejects orphan or ambiguous signatures, and lists only platforms that have a `.sig` file and exits with code 3 when none exist (release without updater).
5. Compute SHA-256 checksums and create the GitHub Release with English notes in the fixed order Highlights, Fixes, Known issues, Install, Checksums. Attach installers, checksums and `latest.json`.
6. Mark pre-releases (`vX.Y-alpha`) as pre-release. `releases/latest` ignores them. The update pill uses the releases API and the selected channel, with full SemVer ordering, so prereleases are visible when opted in. Clicking a prerelease opens its download/page; signed in-app installation still uses the stable `releases/latest/download/latest.json` endpoint. There are no alpha/beta manifest endpoints configured. `sync-version.mjs` strips the native version to numeric x.y.z for installer compatibility, so enabling signed same-core prerelease updates also needs explicit native version/comparison handling. A `.sig` asset alone is not a manifest and does not enable in-app installation. A version counts as stable only after the maintainer has tested it on Windows.

The release script that performs steps 3 to 5 is not in this repository; its asset naming contract is the one above. Installers are unsigned (SmartScreen and Gatekeeper warn). The Microsoft Store package is built as MSIX from `phase1/msix/AppxManifest.template.xml` and submitted separately; Store builds report `is_store_package` and hide the in-app updater.

## Verification that stays manual

Windows frameless window and rounded corners, acrylic background, drag and drop with a real mouse, PDF in WebView2, folder access and saving, LAN collaboration with the firewall, and the updater swap from an older build. See `phase1/notes/windows-evening-test.md` for the checklist used per release.
