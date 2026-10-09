# Experimental Photos Develop bridge

Pinned upstream: https://github.com/storytold/lightcraft at
`ab9e8d372cc69de976b8ee822d260f088d781426`.

This first integration deliberately uses codecs, pipeline, develop, raster and
geom directly. It does not import the engine/session/catalog facade or egui.
JPEG and opaque PNG only; transparent PNG and RAW are rejected, not silently
flattened or replaced by embedded camera JPEGs. The spike's RAW proof remains
research evidence, not a shipped application capability.

Build: install Rust 1.95.0, wasm32-unknown-unknown and wasm-bindgen-cli 0.2.129,
then `sh photos-engine/build.sh` from phase1. Generated JS/WASM are ignored;
tracked declarations allow clean typechecking. Build before Vite or Tauri.
Runtime is a module Worker with Vite-resolved hashed WASM URL, ownership
transfer, serialized commands, 30-second timeout, termination on disposal.

Budgets: 16 MiB input, 16 MP source decoder limit (checked before decode),
2048-pixel decoded source, 1024-pixel preview. Export independently renders the
latest settings at decoded-source size, never merely encodes the last preview.
No original-size claim for larger inputs. Export is an explicit PNG/JPEG copy,
8-bit sRGB, metadata removed. Never invokes overwrite.

The inspector opt-in is separate from RasterEditor/AI edits. Its before/after
canvases, controls, reset and local undo are inside the existing Photos shell.
The main canvas stays the RasterEditor document, not the Develop result. The UI
states that separation explicitly. Settings are session-only, URL-bound, and
survive inspector switches. Close/unload guards protect unexported intent;
sidecar/restart restoration and unified document history are not implemented.

License files copied from the supplied spike conservatively include a broader
closure than this build. `Cargo.lock` is this integration's exact dependency
resolution. Before distribution regenerate the target-specific closure and
notice inventory against that lock, including changed transitive versions.
Do not treat the supplied inventory as certification of this new build.
The Independent JPEG Group acknowledgement and Unicode notice are retained.
