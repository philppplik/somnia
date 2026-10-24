# Native ARM64 release builds

ARM desktop and CLI builds start with `12.2.0-beta.4`. Earlier releases and alpha
versions do not enable them. Ordinary PR/dev runs stay x64 Windows + Linux;
macOS and ARM run on an eligible release tag or manual `full-matrix: true`.
The workflow reads the version from the checked-out commit. It does not bump
`somniaRelease` or create tags/releases itself.

## Runner and cost boundary

- Windows: standard `windows-11-arm`, native `aarch64-pc-windows-msvc`.
- Linux: standard `ubuntu-24.04-arm`, native `aarch64-unknown-linux-gnu`.
- Every build job is gated on public repository visibility (ARM and CLI inherit
  the guarded release-plan dependency). No self-hosted, larger, paid or custom
  runners are used. If the repository becomes private, these jobs skip rather
  than consume paid runner minutes.
- Two desktop ARM jobs and two CLI ARM matrix entries are added only for full
  eligible releases. Existing x64 filenames are unchanged; artifact names carry
  architecture to prevent collisions when downloading both builds.

GitHub's current runner/cost contract:
https://docs.github.com/en/actions/reference/runners/github-hosted-runners

## Installer and CLI contract

| Platform | Release assets | Updater |
| --- | --- | --- |
| Windows x64 | `Somnia-v<version>-x64-setup.exe`, `-x64.msi` | Existing signed NSIS path |
| Windows ARM64 | `Somnia-v<version>-arm64-setup.exe`, `-arm64.msi` | Manual download in this publisher; signatures retained if produced |
| Linux x64 | `Somnia-v<version>-amd64.deb`, `-amd64.AppImage` | Existing signed AppImage path |
| Linux ARM64 | `Somnia-v<version>-arm64.deb` | Manual deb installation only |
| CLI | `somnia-cli-<version>-<linux|windows>-<x86_64|aarch64>.<tar.gz|zip>` | Not used by the desktop updater |

The Windows application is native ARM64. Tauri's NSIS installer bootstrapper
itself remains x86 and uses Windows emulation. Do not describe the entire
installer process as native. MSI/NSIS builds are blocking: no silent fallback
to x64 or dropping a failed package. The separate custom bootstrapper and
Microsoft Store MSIX are not expanded by these changes.

Tauri's ARM64 build and NSIS behavior:
https://v2.tauri.app/distribute/windows-installer/

Linux ARM uses deb only. No ARM AppImage is advertised until its bundling and
runtime are proven. Do not enable signed updater artifacts for deb-only builds:
the desktop updater uses AppImage, not deb. Beta releases remain manual installs;
this publisher does not create `latest.json` or change the stable updater feed.

## Release gate and checksums

Dispatch `phase1-core-bootstrap.yml` on the exact release SHA with
`full-matrix: true`. `pub-beta.sh` and `pub-stable.sh` share `publish.sh` and
`assemble-assets.mjs`. They require a completed successful validation run on
that SHA, green desktop jobs including both ARM jobs, and `cli-checksums`.
They download exact same-SHA artifact names, reject missing/duplicate bundles,
preserve any `.sig` basename pairing, and require all four CLI archives.
`SHA256SUMS.txt` covers every installer and CLI archive, not signatures/evidence.
A dry run verifies checksums and publishes nothing. Stable still requires the
owner's tested-build approval; the script is not that approval.

## Validation

- Local: `cd phase1 && node --test --experimental-strip-types test/cli-release/*.test.ts`.
- YAML syntax: parse the workflow with a YAML parser; review actionlint output
  if available. Unit tests inspect target, naming and gate wiring too.
- CI: require native Rust-host and Node architecture checks, real Cargo suites,
  actual Tauri packaging, PE/ELF ARM64 machine-header checks, CLI archive
  extraction and execution of the packaged `somnia --version`.
- Real Windows ARM device: install both setup and MSI, confirm Task Manager's
  application architecture is ARM64, test WebView2 startup, file association,
  save/reopen, collab firewall behavior and uninstall. Check x64 remains intact.
- Real Linux ARM device: install the deb with apt, open the app under WebKitGTK,
  test save/reopen, media/studio loading and uninstall. Check package architecture
  with `dpkg-deb -f <file.deb> Architecture` (`arm64`).

Header fixtures and artifact fixtures test parsers/assembly only. They do not
prove compilation, GUI behavior, installer installation or runtime performance.
Native execution and device checks remain required after the first ARM CI run.
