#!/bin/sh
# Fetch GridCraft at the pinned commit and apply the wasm32 clock fix. Idempotent.
set -eu
cd "$(dirname "$0")"
rev=fb823899c57b41703edcad2b6476cf4b8a01dfc4
dir=.upstream/gridcraft
if [ ! -d "$dir/.git" ]; then
  mkdir -p .upstream
  git clone --quiet https://github.com/storytold/gridcraft.git "$dir"
fi
git -C "$dir" checkout --quiet --detach "$rev"
git -C "$dir" reset --quiet --hard "$rev"
git -C "$dir" apply ../../upstream-wasm-clock.patch
