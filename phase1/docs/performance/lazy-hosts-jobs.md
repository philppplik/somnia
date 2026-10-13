# Lazy hosts and independent jobs

Baseline: int/shell 0b0b641. Studio manifests and panel allowlists remain eager, pure metadata. Every non-Code canvas, inspector, sidebar and shell panel implementation now loads from an explicit source-owned import factory. Registration remains synchronous so concurrent inspector/canvas mounts cannot race registration. Inline Code media previews no longer bypass these boundaries. No view eviction or dirty-state lifetime change is introduced.

## Initial measurement

Run `node scripts/bench-startup-graph.mjs` from phase1. The retained JSON files record ten local trials, including cold first parsing. These numbers measure source-graph discovery/parsing with Babel, **not application or native startup**. Eager local modules fell from 844 to 701; local source bytes fell from 4,166,063 to 3,503,116. Parse p50 fell from 603.9 ms to 491.4 ms on this container. All 11 inactive canvas/workspace implementations left the eager graph. The graph deliberately ignores dynamic imports, external packages and type-only declarations. Production chunk/native startup validation still requires generated craft WASM packages and supported hardware.

118 existing shell/studio/slide tests passed locally. Typecheck currently reports only the absent generated `slides-engine/pkg/somnia_slides.js`. No Rust/native test was run. This is not a release performance certification.
