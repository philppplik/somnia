# One-click updater

Status: wired, not yet proven. It needs a release built with the signing secrets, then an install from an older build on Windows.

How it works
- Tauri updater plugin checks `https://github.com/philppplik/somnia/releases/latest/download/latest.json`. The file lists signed installers per platform (Windows NSIS, Linux AppImage). The app verifies every download against the public key in `tauri.conf.json` before installing.
- Status bar pill "New version X - Update now": in the desktop app it downloads, installs and restarts. On any failure, or when a release has no signed update, it opens the release download page instead.
- The pill only shows for stable GitHub releases that are newer than this build. `releases/latest` ignores pre-releases, so pre-releases never auto-install.

Keys
- Key pair made with `tauri signer generate`. The public key is in the config. The private key and its password are only in GitHub Actions secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` and in the owner's vault (backup). They are never committed or sent in chat. If they are lost, existing installs cannot receive updates and a new key plus a manual reinstall is needed.
- Without the secrets, CI still builds unsigned installers and no updater artifacts.

Release flow
1. CI (`sync-version.mjs --updater`) sets the app version from `somniaRelease` and signs the installers.
2. `scripts/make-latest-json.py` builds `latest.json` from the `.sig` files; the release script uploads it as an asset.

Limits
- macOS: the macOS CI job now also builds the signed updater archive (`.app.tar.gz` + `.sig`) when the signing secrets exist, and `make-latest-json.py` lists it as `darwin-aarch64` when given the macOS folder as 6th argument. Not yet proven on a real Mac (and the app is not notarized, so Gatekeeper may still block the replaced app). Windows installs use `installMode: passive`.
- Windows code signing is separate (SmartScreen warnings remain until a certificate exists).
- First real test: install v(N), publish v(N+1) with latest.json, click the pill on Windows.

## Secrets
CI reads TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD (repository secrets). When present, builds emit signed updater artifacts (.sig) and latest.json.

## Updater end-to-end harness (no secrets needed)
`npm run test:updater` (also runs in CI). Code: `scripts/updater-e2e/`.
- `harness.mjs` creates fake signed artifacts for Windows, Linux and macOS, runs `make-latest-json.py` like the release step, serves the result on a local HTTP server that imitates `releases/latest/download/latest.json`, then plays the app: checks the manifest shape Tauri needs, only offers strictly newer versions (no downgrade, no repeat), and checks asset names/URLs. Options: `--current 9.18.0 --next 9.19.0 --platform windows-x86_64`.
- `lib.mjs` holds the checks (version compare, manifest validation); `lib.test.mjs` unit-tests them plus the old Windows+Linux-only call and the exit code 3 case.
- What it does NOT prove: the real signature check (needs the real key) and the installer swap. That stays the manual Windows test below.

### Manual real-world test (Windows)
1. Install the older stable build (e.g. 9.18.0).
2. A newer stable release must exist with `latest.json` attached; open the app and wait for the green "New version" pill in the status bar.
3. Click it: the app should download, install and restart on the new version (Settings > About shows the number).
4. Failure path: the pill should open the release page instead.

### Release-script contract
Asset names must match the URLs `make-latest-json.py` writes: `Somnia-<tag>-x64-setup.exe`, `Somnia-<tag>-amd64.AppImage`, `Somnia-<tag>-macos-<aarch64|x86_64>.app.tar.gz`. The release script (outside this repo) must upload the macOS `.app.tar.gz` under that name. Set `SOMNIA_MACOS_ARCH=x86_64` for Intel builds.
