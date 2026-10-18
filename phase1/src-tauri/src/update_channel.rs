//! Signed auto-update per channel (stable, beta, alpha).
//!
//! The Tauri updater reads fixed endpoints from `tauri.conf.json` and only offers versions greater than the native app
//! version, which `sync-version.mjs` strips to numeric x.y.z. Prerelease ordering therefore cannot work through the stock
//! JS `check()`. Two commands take over: `check_channel_update` fetches the channel manifest and reports the version it
//! offers (no version comparison here), the frontend decides with full SemVer (`src/lib/updateChannel.ts`), then
//! `install_channel_update` downloads and installs exactly that version. The download is still verified against the
//! public key from `tauri.conf.json`; this module never handles keys.

const RELEASES: &str = "https://github.com/philppplik/somnia/releases";
const CHANNEL_TAG: &str = "updater-channels";

/// Manifest URL for a channel name, `None` for unknown names. Must match `manifestUrl` in `updateChannel.ts`.
pub(crate) fn manifest_url(channel: &str) -> Option<String> {
    match channel {
        "stable" => Some(format!("{RELEASES}/latest/download/latest.json")),
        "beta" | "alpha" => Some(format!("{RELEASES}/download/{CHANNEL_TAG}/latest-{channel}.json")),
        _ => None,
    }
}

#[cfg(feature = "desktop")]
async fn find(
    app: &tauri::AppHandle,
    channel: &str,
) -> Result<Option<tauri_plugin_updater::Update>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let url = manifest_url(channel).ok_or_else(|| format!("unknown update channel {channel}"))?;
    let url = url::Url::parse(&url).map_err(|e| e.to_string())?;
    app.updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        // The frontend owns the "is it newer" decision, see the module docs.
        .version_comparator(|_current, _remote| true)
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())
}

/// Version string offered by the channel manifest for this platform, or `None` when the manifest has no signed build for it.
#[cfg(feature = "desktop")]
#[tauri::command]
pub(crate) async fn check_channel_update(
    app: tauri::AppHandle,
    channel: String,
) -> Result<Option<String>, String> {
    Ok(find(&app, &channel).await?.map(|u| u.version))
}

/// Downloads and installs the channel update, but only when the manifest still offers `expected_version`
/// (guards against the manifest changing between check and install). Emits `update-progress` events:
/// `{ "phase": "downloading", "downloaded": n, "total": n|null }` and `{ "phase": "installing" }`.
/// The frontend restarts the app afterwards.
#[cfg(feature = "desktop")]
#[tauri::command]
pub(crate) async fn install_channel_update(
    app: tauri::AppHandle,
    channel: String,
    expected_version: String,
) -> Result<bool, String> {
    use tauri::Emitter;
    let Some(update) = find(&app, &channel).await? else {
        return Ok(false);
    };
    if update.version != expected_version {
        return Err(format!(
            "the {channel} manifest changed from {expected_version} to {}, check again",
            update.version
        ));
    }
    let progress = app.clone();
    let mut downloaded: u64 = 0;
    let done = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = progress.emit(
                    "update-progress",
                    serde_json::json!({"phase":"downloading","downloaded":downloaded,"total":total}),
                );
            },
            move || {
                let _ = done.emit("update-progress", serde_json::json!({"phase":"installing"}));
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::manifest_url;

    #[test]
    fn stable_uses_releases_latest() {
        assert_eq!(
            manifest_url("stable").unwrap(),
            "https://github.com/philppplik/somnia/releases/latest/download/latest.json"
        );
    }

    #[test]
    fn prerelease_channels_use_the_fixed_manifest_release() {
        assert_eq!(
            manifest_url("beta").unwrap(),
            "https://github.com/philppplik/somnia/releases/download/updater-channels/latest-beta.json"
        );
        assert!(manifest_url("alpha").unwrap().ends_with("/updater-channels/latest-alpha.json"));
    }

    #[test]
    fn unknown_channels_are_rejected() {
        assert!(manifest_url("nightly").is_none());
        assert!(manifest_url("../x").is_none());
    }
}
