#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
cargo +1.95.0 build --locked --manifest-path packages/raster-codec/Cargo.toml --target wasm32-unknown-unknown --features wasm --release
wasm-bindgen packages/raster-codec/target/wasm32-unknown-unknown/release/somnia_raster_codec.wasm --target web --out-dir packages/raster-codec/pkg
# Notices must accompany packaged distributions, not only the source tree.
mkdir -p public/raster-codec
cp -R packages/raster-codec/notices public/raster-codec/notices
cp packages/raster-codec/THIRD_PARTY.md public/raster-codec/THIRD_PARTY.md
