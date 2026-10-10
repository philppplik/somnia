#!/bin/sh
# Stage the vendored GridCraft tree (pinned rev + wasm clock fix, see vendor/)
# into .upstream/. Idempotent and fully offline. The Cargo.toml path
# dependencies point at .upstream/gridcraft/...
set -eu
cd "$(dirname "$0")"
src=vendor/gridcraft
dir=.upstream/gridcraft
stamp="$dir/.vendor-stamp"
want=$(cat vendor/REVISION)
if [ ! -d "$dir" ] || [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$want" ]; then
  rm -rf .upstream
  mkdir -p .upstream
  cp -R "$src" "$dir"
  echo "$want" > "$stamp"
fi
