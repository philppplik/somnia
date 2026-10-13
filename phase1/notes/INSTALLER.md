# Custom Windows installer

## Integration

The v1 installer was recovered from `int/custom-installer` at `bbd4efdb` and integrated against `int/rc` at `1c3b1b6`. It is a separate Rust workspace in `phase1/installer`, not another Studio. No CI workflow is added or triggered by this integration.

- Artifact: `Somnia-Setup.exe`.
- Native, borderless 800 x 600 WebView2 shell. HTML/CSS UI is embedded, with a restrictive CSP and no remote scripts.
- v1 embeds a SHA-256-checked NSIS payload. Downloading the latest version is deferred to v2.
- UI font follows the application's system UI font stack (Segoe UI on Windows).
- Five locales: English, German, Spanish, French, Brazilian Portuguese. Key/placeholder parity is tested. These are not certified native-speaker translations.
- Launch at sign-in is opt-in. Automatic update checks default on and are applied on first app start, before the first check. Upgrades preserve app preferences.
- License edge fade is a stationary overlay, removed at the end of the scroll area. It does not mask text or consume pointer input. The acceptance gate requires scrolling the visible license and ticking its checkbox.
- Finish keeps the existing animated checkmark, disabled under reduced motion. Confetti remains unresolved because the original spec documents are absent and prior notes describe a conflict.
- MSI and stock NSIS remain available as separate distribution choices. Signing/SignPath is unchanged and deferred.

## Packaging locally on Windows

Build the application's existing WASM engines and run the normal local checks first. Run `node scripts/sync-version.mjs` in `phase1`. Use `installer/scripts/build.ps1 -InstalledBytes <measured bytes>` from a Windows shell. The size must come from a real isolated test installation, not a guess. The script does not install the application to probe its size or modify the packager's registry.

The custom payload MUST combine `tauri.windows-alpha.conf.json` with `tauri.custom-installer-payload.conf.json`. The latter clears stock file associations so the custom checkbox can really opt out. A supplied `-Payload` must have been built with that configuration. Never embed an arbitrary existing stock payload.

The build refuses a missing embedded payload, zero/absent installed-size metadata, or missing version. Install paths reject drive roots and characters unsafe for the raw NSIS destination argument. Output is `phase1/out-installer/Somnia-Setup.exe` and `SHA256SUMS`. There is no auto-release, upload, workflow dispatch, or push in this task.

## Safety changes

- All installer subprocesses use the same `NoWindow` trait semantics as `int/nowin` (`d953bb8`). The installer binary also has the Windows GUI subsystem flag.
- Both shortcut checkboxes off still executes shortcut opt-outs. Shortcut filenames and redirected Desktop/Start-menu paths require Windows verification before shipping.
- SOM-OLD-06 blocks occupied destinations outside the registered install directory. It offers another folder and never deletes an occupied directory. Registered upgrades require the registry's InstallLocation to resolve to the selected directory.
- Cancellation waits for the current NSIS process rather than killing it midway. Already-installed files and registry changes can remain. The UI copy makes this explicit. Only the temporary embedded payload is cleaned. Full transactional rollback is NOT implemented.
- Native close requests go through the same confirmation path as X/Escape; close IPC cannot exit while an install is running.
- A successful NSIS exit alone is insufficient: the expected app executable must exist before success is shown.
- Temporary payload directories use a per-run nonce; the write-permission probe uses create-new rather than overwriting a fixed file.

## Checks and limits

Test commands from `phase1`:

```sh
node --test installer/ui/logic.test.mjs
CHROME_PATH=/path/to/chrome node --test installer/ui/browser.test.mjs
npx tsx --test src/lib/installerHandoff.test.ts src/lib/updates.test.ts
cd installer && cargo test --locked -p somnia-installer-core
```

The browser test checks the license scroll gate, focus trapping, occupied-folder recovery, five-locale options layout, and reduced-motion finish. Screenshots were visually checked at 800 x 600: welcome/light, options/German, license/light, finish/dark, and SOM-OLD-06/German. Mock-browser success is not proof of Windows installation.

Integration checks: `check:commands`, `check:ui-commands`, `check:layers`, `tsc --noEmit`. Layer checker currently warns that it does not support the repository's TypeScript 7 version. Full typecheck requires generated `slides-engine/pkg/somnia_slides.js`. A timed-out full core test run is not a passing run. The Windows GNU cross-check also timed out while compiling its dependency `windows` and did not reach a native compiler verdict.

Required before distribution: native Windows compile/build; clean install, occupied destination, upgrade from stock NSIS, existing registry key/InstallLocation behavior, redirected Desktop, shortcut opt-outs, associations opt-in/out, launch-at-sign-in on/off, updater first-start on/off, cancellation, process-close handling, WebView2-missing handling, high DPI, screen reader and contrast audit. The standalone Linux cargo check excludes all Windows code and does not replace those tests.

Missing source documents: original copy-spec and accessibility-checklist. WCAG-AA certification, native-speaker pass, and the confetti decision remain open. No release readiness claim is made by this patch.
