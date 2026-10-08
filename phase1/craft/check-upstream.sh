#!/bin/sh
# Optional full-facade wasm32 type checks, isolated from Somnia.
set -eu
root=${1:-"${TMPDIR:-/tmp}/somnia-craft-upstream"}
mkdir -p "$root"
for pair in \
  photocraft:c833294e34124eb8025de91627eb5a2d3a50f422 \
  designcraft:14e677b24216396e398823ff034d9882322362d1 \
  pdfcraft:f70c4caac902086fdc4cfbec7fc94c109f4a89d2
do
  repo=${pair%%:*}; rev=${pair#*:}
  if [ ! -d "$root/$repo/.git" ]; then git clone "https://github.com/philppplik/$repo.git" "$root/$repo"; fi
  git -C "$root/$repo" checkout --detach "$rev"
  # Inside the PDF workspace, the root patch table retains vendored fuzz fixes.
  (cd "$root/$repo" && cargo +1.95.0 check --locked --target wasm32-unknown-unknown -p "$repo-engine")
done
