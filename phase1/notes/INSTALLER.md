# Installer branding

What Somnia's Windows installers can and cannot do (Tauri 2 bundler):

- NSIS (.exe): Somnia sidebar and header images, installer icon, per-user install, no language picker. The wizard pages themselves (Welcome, Directory, Progress, Finish) are the standard NSIS pages with Somnia artwork. Fully custom pages need a custom NSIS template (`bundle.windows.nsis.template`) and NSIS scripting; possible, but every Tauri update can break it.
- MSI: banner and dialog bitmaps through WiX. The dialog flow is the WiX default.
- Not possible with these tools: a web-style (React/CSS) installer window or animations. That would need our own bootstrapper app, which we do not plan for now.
- Images live in `src-tauri/installer/` (generated from the app icon: sidebar 164x314, header 150x57, WiX banner 493x58, dialog 493x312, 24-bit BMP). Config: `tauri.windows-alpha.conf.json`.
- Status: configured and built by CI; not yet checked on a real Windows machine. The installer stays unsigned (SmartScreen warns).
