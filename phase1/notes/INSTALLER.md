# Installer branding

What Somnia's Windows installers can and cannot do (Tauri 2 bundler):

- NSIS (.exe): Somnia sidebar and header images, installer icon, per-user install, no language picker. The wizard pages themselves (Welcome, Directory, Progress, Finish) are the standard NSIS pages with Somnia artwork. Fully custom pages need a custom NSIS template (`bundle.windows.nsis.template`) and NSIS scripting; possible, but every Tauri update can break it.
- MSI: banner and dialog bitmaps through WiX. The dialog flow is the WiX default.
- Not possible with these tools: a web-style (React/CSS) installer window or animations. That would need our own bootstrapper app, which we do not plan for now.
- Images live in `src-tauri/installer/` (generated from the app icon: sidebar 164x314, header 150x57, WiX banner 493x58, dialog 493x312, 24-bit BMP). Config: `tauri.windows-alpha.conf.json`.
- Status: configured and built by CI; not yet checked on a real Windows machine. The installer stays unsigned (SmartScreen warns).

## Release checklist note
Bump `somniaRelease` in `phase1/package.json` to the tag being released before building. The in-app update pill compares it (major.minor.patch) with the newest GitHub release.

## ARM64 from beta.4

Native Windows ARM64 jobs use the same branded NSIS/MSI configuration on `windows-11-arm`. Tauri NSIS bootstraps through an x86 installer, but installs the native ARM64 application. Filenames and the real-device test gate: [ARM64 release builds](../../docs/release-tools/arm64.md). Linux ARM64 ships deb only. No custom bootstrapper or Store ARM64 package is implied.
