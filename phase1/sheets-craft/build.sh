#!/bin/sh
set -eu
cd "$(dirname "$0")"
# Needs Rust 1.95.0 + wasm32 target and wasm-bindgen-cli exactly 0.2.129 (shared with ../craft).
sh ./prepare-upstream.sh
cargo +1.95.0 build --locked --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir pkg target/wasm32-unknown-unknown/release/somnia_sheets_craft.wasm
