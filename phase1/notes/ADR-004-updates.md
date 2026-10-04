# ADR-004: Updates and licence

## Licence
MIT, Copyright (c) 2026 Philipp Paulik (Philipp's decision, 2026-10-04). `LICENSE` in the repo root; Settings > About shows it with the third-party package list (`npm run licenses` regenerates `src/lib/thirdParty.json` from the installed production dependencies).

## Update check (done)
Settings > Updates asks the public GitHub Releases API for the newest published release and compares its tag (v9, v9.5, v8.5-alpha) with `somniaRelease` in `package.json`. It only runs when the user presses the button, sends no identifiers, and links the installer asset and release notes. The desktop CSP allows `connect-src https://api.github.com` for this and nothing else.

## One-click update (not active, needs Philipp)
The Tauri updater verifies signed bundles. What it takes:
1. A signing key pair (`tauri signer generate`). The public key goes into `tauri.conf.json` (`plugins.updater.pubkey`), the **private key and its password only into GitHub repository secrets** (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Never into the repo or a chat.
2. `tauri-plugin-updater` and `tauri-plugin-process` in `src-tauri`, `bundle.createUpdaterArtifacts: true`, endpoint `https://github.com/philppplik/somnia/releases/latest/download/latest.json`.
3. The release workflow uploads `latest.json` plus the `.sig` files (tauri-action does this).
4. CSP `connect-src` for github.com and the release asset host.
Limits: `releases/latest` ignores pre-releases, so alpha builds need an explicit channel file. The Windows installer is not Authenticode-signed, SmartScreen still warns on first run; updater signatures are separate from that.
Status: not built. Waiting for the secrets to be set by Philipp.
