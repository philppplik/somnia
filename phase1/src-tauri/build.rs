fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "collab_lan_start",
            "collab_lan_stop",
            "collab_lan_status",
            "choose_project",
            "choose_file",
            "open_dropped_project",
            "read_dropped_files",
            "is_store_package",
            "list_files",
            "read_file",
            "read_media",
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
