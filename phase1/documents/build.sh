#!/bin/sh
# Builds the headless WordCraft document engine (Rust/WASM) for the Documents Studio.
# Needs Rust 1.95.0 + wasm32-unknown-unknown, wasm-bindgen-cli exactly 0.2.129, git, python3.
set -eu
cd "$(dirname "$0")"
PIN=$(cat UPSTREAM_COMMIT)
if [ ! -d upstream/.git ]; then git clone --quiet https://github.com/storytold/wordcraft.git upstream; fi
git -C upstream fetch --quiet origin "$PIN" 2>/dev/null || true
git -C upstream checkout --quiet --force "$PIN"
git -C upstream clean -fdxq
git -C upstream apply ../wordcraft-worker.patch
(cd upstream && python3 spikes/somnia-documents/scripts/fixtures.py)
(cd upstream && cargo +1.95.0 test --locked -p wordcraft-somnia-worker --lib)
(cd upstream && cargo +1.95.0 build --locked --release -p wordcraft-somnia-worker --target wasm32-unknown-unknown)
wasm-bindgen upstream/target/wasm32-unknown-unknown/release/wordcraft_somnia_worker.wasm --target web --out-dir pkg
