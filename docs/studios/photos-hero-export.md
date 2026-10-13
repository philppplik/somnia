# Photos header export

The header Export button opens a small setup popover, anchored to the shared hero slot. It does not write until Export copy or Enter is pressed. Escape and outside click close setup. The last PNG/JPEG format remains in the app session. Original bytes are never replaced.

`photos.export.open` is UI-only and has `Mod+Shift+E`. The shortcut inventory has no competing entry while Photos is mounted; Design uses the same chord only while its own canvas is mounted. `photos.export.png` and `.jpeg` are one-click menu entries. Publish remains the last shared secondary action, with its existing desktop availability and review gates.

The popover and right-rail Export panel use `usePhotoExport` and dispatch `photos.export`. That command holds a shared in-flight gate and follows active photo readiness, processing and crop state. Errors and cancellation stay in setup, and the command releases the gate in a finally block. Neutral photos can export and have an explicit unchanged-copy note.

JPEG quality is deliberately not shown: neither `PhotoEngineLike.exportPhoto` nor the worker protocol has a quality input. Existing engine limits and original-safe save host remain unchanged. No folder-next-to-original feature is implied.

Validation: focused command/session tests and light/dark browser setup tests. Browser Photos uses a deterministic engine double in this source checkout; compiled LightCraft pixels, PNG/JPEG encoding, Tauri destination selection and Windows behavior remain unverified. No WASM stubs are shipped in the patch.

Roadmap-Delta: Photos Export promoted to header; setup, format memory and common busy gate added. Quality control requires a future engine contract.
