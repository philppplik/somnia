#!/bin/sh
set -eu
cd "$(dirname "$0")"
cargo +1.95.0 build --locked --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir pkg target/wasm32-unknown-unknown/release/somnia_slides.wasm
mkdir -p ../public/slides/notices
cp -R notices/. ../public/slides/notices/
