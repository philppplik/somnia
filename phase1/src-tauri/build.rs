fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "choose_project",
            "choose_file",
            "is_store_package",
            "list_files",
            "read_file",
            "stage_edit",
            "save_file",
            "delete_file",
            "open_external",
            "recovery_list",
            "recovery_read",
            "recovery_restore",
            "recovery_discard",
            "close_project",
        ]),
    ))
    .expect("Tauri build configuration failed");
}
