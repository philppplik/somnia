//! Android/iOS entry point. The webview loads the bundled frontend, which runs its browser-mode paths
//! (the frontend build aliases isTauri() to false, see src/mobile/tauriCoreShim.ts). Desktop-only
//! services (project backend, git, deploy, MCP, keyring, updater, single-instance) are not part of this build.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Somnia");
}
