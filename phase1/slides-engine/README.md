# Somnia Slides engine, package 1

Read-only PPTX preview adapter pinned to DeckCraft d0e57d7e25f9852179cc66be12dd6188f1c05535 (MIT OR Apache-2.0). No upstream app, logo, full engine, MCP, media codecs or PDF export. The interface deliberately has no edit/export methods.

Install Rust 1.95.0, its wasm32-unknown-unknown target and wasm-bindgen-cli 0.2.129. Run `sh slides-engine/build.sh` from phase1. Existing `npm run craft:build` now also builds this isolated engine for all normal CI/release targets; native Tauri's Rust toolchain stays unchanged. Generated pkg is ignored, Cargo.lock is committed. Build copies notices to public/slides/notices. Narrow CI also lives in `.github/workflows/slides-studio.yml`.

The safety wrapper reads every ZIP entry with bounded expansion before upstream intake: 32 MiB compressed input, 2048 entries, 4 MiB XML/relationships, 16 MiB other parts, 64 MiB total, no duplicate/traversal paths, required presentation part. Deck intake accepts 1-200 slides. Rendering caps output at 4096px/8 MP. The worker's 30-second deadline terminates its process rather than merely ignoring a late reply. Closing/replacing a deck terminates workers and revokes images; switching Studio retains the one session. No document bytes are uploaded or written to disk.

This is not a compatibility or security audit. XML complexity and decoded image allocations remain risks within byte limits; the timeout is not a heap limit. Upstream may return a blank PNG on a caught render panic. The UI states this caveat. Complex objects, inherited fonts, animation, notes and arbitrary external decks have not been verified. Blank rendering is not proof of an empty slide.

Package 1 uses an explicit Open PPTX control and a single in-memory presentation session, not the shared file tabs/disk/undo service. That boundary avoids exposing an unsafe save-over-original workflow. Native open/drop routing, per-tab sessions and selection/text editing belong to package 2 after a loss-aware corpus and save-as-copy design.

Notices originate from the supplied worker spike. Upstream source: https://github.com/storytold/deckcraft
