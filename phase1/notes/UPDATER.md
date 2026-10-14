# One-click updater

Status: wired, not yet proven. It needs a release built with the signing secrets, then an install from an older build on Windows.

How it works
- Tauri updater plugin checks `https://github.com/philppplik/somnia/releases/latest/download/latest.json`. The file lists signed installers per platform (Windows NSIS, Linux AppImage). The app verifies every download against the public key in `tauri.conf.json` before installing.
- Status bar pill "New version X - Update now": in the desktop app it downloads, installs and restarts. On any failure, or when a release has no signed update, it opens the release download page instead.
- The pill shows releases newer than this build that the selected channel allows (Settings > About). Stable builds only see stable releases; opting into beta or alpha adds prereleases, see Channels.

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

## Channels
Status: implemented, not yet run against a real release (no Rust toolchain in the authoring environment: `update_channel.rs` is uncompiled, its tests unrun).

| Channel | Manifest URL | Receives |
|---|---|---|
| stable | `releases/latest/download/latest.json` | stable releases |
| beta | `releases/download/updater-channels/latest-beta.json` | beta, rc and stable releases |
| alpha | `releases/download/updater-channels/latest-alpha.json` | every release |

- Why a fixed release: `releases/latest` skips pre-releases, and the updater endpoint must be a stable URL. `updater-channels` is a single pre-release that only holds the two rolling manifests; its assets are replaced on every release.
- Publishing: `make-latest-json.py <tag> ... --channels-dir DIR` writes the manifests this tag must refresh (`channels_for`). The release script uploads them with `gh release upload updater-channels DIR/* --clobber`. A manifest only ever lists the newest release at or above its channel's stability, so nothing needs deleting.
- Channel of a tag: no prerelease id is stable, `alpha|nightly|canary|dev` is alpha, any other id (beta, rc) is beta. The same rule exists in `updatePrefs.ts`, `updateChannel.ts` and `make-latest-json.py`; tests keep them aligned.
- Why custom commands: the stock updater compares against the native version, which `sync-version.mjs` strips to numeric x.y.z (MSI needs that), so `12.2.0-beta.3` would never beat `12.2.0-beta.2`. `check_channel_update` returns the offered version, `src/lib/updateChannel.ts` decides with full SemVer (`shouldInstall`: strictly newer, channel allowed, numeric prerelease ids, final beats its prerelease), then `install_channel_update` installs exactly that version after re-checking the manifest. The signature is still verified against the public key in `tauri.conf.json`.
- Macs: not notarized, same limits as above.

## Signing key handling (plan, no keys in the repo)
- One key pair signs all channels. A second key per channel would need a second pubkey in the app and cannot be rotated for installs that already exist.
- The private key and password stay in the GitHub Actions secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` and in the owner's vault. Alpha and beta CI runs on the public repo get them like release runs; do not expose them to workflows triggered by forks or pull requests.
- Before the first signed alpha or beta goes out, verify once: build a prerelease with the secrets, check that `.sig` files exist, run `make-latest-json.py --channels-dir`, upload, and install from the previous build on Windows.
- Rotation: a new key needs a build with the new pubkey that is still signed with the old key, shipped as a normal update; only after that may the old key go. Losing the key means a manual reinstall for everyone.

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
