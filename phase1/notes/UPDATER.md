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
- macOS is not in `latest.json` yet (the dmg bundle has no updater archive). Windows installs use `installMode: passive`.
- Windows code signing is separate (SmartScreen warnings remain until a certificate exists).
- First real test: install v(N), publish v(N+1) with latest.json, click the pill on Windows.

## Secrets
CI reads TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD (repository secrets). When present, builds emit signed updater artifacts (.sig) and latest.json.
