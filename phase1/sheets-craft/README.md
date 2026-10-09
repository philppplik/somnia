# Somnia Sheets engine (GridCraft headless, isolated WASM)

Spreadsheet engine for the Sheets Studio. It wraps the `gridcraft-engine` and
`gridcraft-xlsx` crates (MIT OR Apache-2.0, used under MIT) behind a byte-only
wasm-bindgen adapter (`src/lib.rs`). The app talks to it through a module Worker
(`src/lib/sheets/engine.ts`, `worker.ts`). No filesystem, DOM or egui UI is linked.

Provenance: this started as the 2026-10-08 GridCraft headless spike (base commit
`fb823899c57b41703edcad2b6476cf4b8a01dfc4`), see `licenses/` for the notices and the
dependency license closure that came with it.

## Build

Same isolated toolchain as `../craft`: Rust 1.95.0, `wasm32-unknown-unknown`,
`wasm-bindgen-cli` exactly 0.2.129.

```sh
cd phase1/sheets-craft
./build.sh              # fetches GridCraft at the pinned commit, applies the clock patch, builds pkg/
cargo +1.95.0 test      # adapter tests (3), run after prepare-upstream.sh
```

`npm run craft:build` runs it together with the other bridges. `pkg/` is generated
and ignored, except `somnia_sheets_craft.d.ts`.

## Upstream patch

`upstream-wasm-clock.patch` is the only change to GridCraft. `Session::commit`
called `std::time::Instant::now()` unconditionally, which panics on
wasm32-unknown-unknown and aborted every edit in the browser. The patch skips that
clock on wasm32. Preferably this becomes a fork or an upstream PR, so the patch step
can go away. `prepare-upstream.sh` clones into `.upstream/` (ignored) and is idempotent.

## Adapter limits

- Input: 32 MiB compressed, one cell entry at most 32,767 UTF-8 bytes, reads at most 10,000 cells.
- Upstream ZIP limits are much higher (512 MiB per part). Hostile files can still exhaust the
  worker; the client terminates it after 30 s and keeps the original bytes outside the worker.
- Not supported: macros, encrypted workbooks, legacy .xls, external links, pivot or chart editing.
  The writer rebuilds the package from the model, so unknown parts can be lost: Somnia only
  exports a copy and never overwrites the source.
- `NOW()`/`TODAY()` return a constant in WASM until the host supplies a time source.
- Number formats and styles from the file are not rendered by the grid yet.

Measurements from the spike (100k numeric cells, headless Chrome): open about 115 ms warm,
one edit 4.3 ms, export 175 ms, WASM 5.8 MB raw. Diagnostic only, not an SLA.
