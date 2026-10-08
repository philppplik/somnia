#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cargo +1.95.0 build --locked --release --target wasm32-unknown-unknown
wasm-bindgen --version | grep -q '0.2.129'
wasm-bindgen --target web --out-dir pkg target/wasm32-unknown-unknown/release/somnia_pdf_craft.wasm
