# Somnia Documents engine (WordCraft, headless)

Rust/WASM document engine for the Documents Studio. It reads, lays out, rasterises and
writes DOCX inside a dedicated Worker. Upstream: https://github.com/storytold/wordcraft,
pinned in `UPSTREAM_COMMIT`. `wordcraft-worker.patch` only adds a new headless adapter crate
(`crates/somnia-worker`, reference copy in `adapter-lib.rs.reference`) and Cargo.lock entries.
No upstream engine source is changed. No upstream UI, logo or ArtCraft branding is used.

Build: `npm run documents:build` (needs Rust 1.95.0, wasm32 target, wasm-bindgen-cli 0.2.129).
`pkg/` runtime files are generated and ignored; only the `.d.ts` is tracked, like `craft/pkg`.
The spike that proved this was built with Rust 1.99.0; CI uses the repo's 1.95.0 toolchain.

Licence: WordCraft is MIT OR Apache-2.0 (we use MIT). Fonts are OFL-1.1. Notices live in
