# ARM64 release-note section for 12.2.0-beta.4

Merge these lines into the full release notes after the real ARM CI jobs pass.
This template is not a claim that the builds or device checks have passed.

## Highlights

- Native Windows ARM64 application and CLI builds for Windows-on-ARM PCs.
- Native Linux ARM64 deb package and CLI archive.

## Fixes

- Architecture-specific artifact names and release checksum coverage keep x64
  and ARM64 downloads separate. Existing x64 names stay unchanged.

## Known issues

- Installers remain unsigned; SmartScreen can warn. The Windows NSIS starter
  runs through x86 emulation, but the application payload is native ARM64.
- Linux ARM64 ships a deb package, not an AppImage. Manual installation only.
- Fill in the actual Windows/Linux ARM device-test results before publishing.
  CI compilation and header checks do not prove GUI or installer behavior.
- No Store ARM64 package, custom bootstrapper ARM payload or ARM updater feed
  is included by this pipeline change.

## Install

- Windows ARM64: use `Somnia-v12.2.0-beta.4-arm64-setup.exe` or `-arm64.msi`.
  Windows x64: keep using the `-x64-setup.exe` or `-x64.msi` build.
- Linux ARM64: use `Somnia-v12.2.0-beta.4-arm64.deb` with apt on a compatible
  ARM64 system with the required GTK/WebKit libraries.
- CLI ARM64: `somnia-cli-12.2.0-beta.4-windows-aarch64.zip` or
  `somnia-cli-12.2.0-beta.4-linux-aarch64.tar.gz`; keep `sidecar/` next to the
  binary and install Node 20+ and git on PATH.

## Checksums

`SHA256SUMS.txt` covers every desktop installer and CLI archive in this release.
Use the line for the exact file you downloaded. Linux: `sha256sum -c
SHA256SUMS.txt --ignore-missing`; Windows: `Get-FileHash <file> -Algorithm SHA256`.
