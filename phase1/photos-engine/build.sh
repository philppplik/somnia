#!/bin/sh
set -eu
cd "$(dirname "$0")"
cargo +1.95.0 build --locked --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir pkg target/wasm32-unknown-unknown/release/somnia_photos_spike.wasm
