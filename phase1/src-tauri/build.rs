fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "choose_project",
            "list_files",
            "read_file",
            "stage_edit",
            "save_file",
            "delete_file",
            "recovery_list",
            "recovery_read",
            "recovery_restore",
            "recovery_discard",
            "close_project",
        ]),
    ))
    .expect("Tauri build configuration failed");
}
