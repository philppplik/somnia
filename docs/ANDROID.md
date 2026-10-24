# Android build (Play upload, AAB)

Status: bootstrap. The Android app is a webview shell around the bundled frontend. It does not include the desktop
backend: projects on disk, git, deploy, MCP, the local agent runtime, keyring, updater and single-instance are
desktop-only and are not compiled into the mobile build.

## How it is built

- Cargo feature `mobile` (`--no-default-features --features mobile`): `tauri` only. `src-tauri/src/mobile.rs` holds the
  `mobile_entry_point`. The desktop `run()` and its plugins are behind the `desktop` feature as before.
- `tauri.android.conf.json` is merged over `tauri.conf.json` for Android: app id `app.somnia.mobile`, minSdk 26, the
  `mobile` capability (`core:default` only) instead of the desktop `editor` capability, no file associations.
- Frontend: `npm run build:mobile` (`vite build --mode mobile`). In this mode `@tauri-apps/api/core` is aliased to
  `src/mobile/tauriCoreShim.ts`, which keeps the real exports but makes `isTauri()` return false. Every existing
  `isTauri()` gate therefore takes its browser-mode path, and no desktop command is invoked.
- CI: `.github/workflows/android-aab.yml` (free GitHub-hosted ubuntu runner). It generates the Android project with
  `tauri android init` (not committed), optionally wires release signing, builds an arm64 `.aab` and uploads it.

## Signing

Secrets (repository secrets): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`. Without them the workflow builds an unsigned bundle (build verification only; Play needs a
signed upload). Use Play App Signing: the keystore is only the upload key.

## Known limits

- Browser-mode behaviour: no project folders on disk, downloads instead of native save dialogs, no git/deploy/agent
  runtime. File System Access API support in Android WebView is limited.
- The app id is permanent once published. Change `identifier` in `tauri.android.conf.json` before the first upload if needed.
- arm64-v8a only in CI. Add targets in the workflow when needed.
- Not verified locally: the Rust/Android build and the AAB run only in CI.
