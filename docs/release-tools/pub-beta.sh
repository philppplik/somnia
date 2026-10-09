#!/bin/sh
# Publish a Somnia pre-release on GitHub from a green CI run. GitHub only.
#
# Usage: pub-beta.sh <version> <sha> <run-id> <notes.md> [--dry-run]
#   version   e.g. 11.3.0-beta.4 (the tag becomes v<version>)
#   sha       full commit SHA the CI run built; the tag points at it
#   run-id    workflow run id of phase1-core-bootstrap for that SHA
#   notes.md  English release notes (Highlights, Fixes, Known issues, Install, Checksums)
#
# The token is read from $GITHUB_TOKEN (or the file in $GITHUB_TOKEN_FILE). It is never printed.
# Rules this script enforces:
#   - the run built exactly <sha> and all four jobs (native, macos, windows, frontend) succeeded
#   - assets come only from that run's CI artifacts (no locally built files, no shared WASM zips)
#   - the release is a pre-release and never "latest"; no Store or auto-update metadata is touched
set -eu
[ $# -ge 4 ] || { sed -n '2,12p' "$0"; exit 2; }
VERSION=$1; SHA=$2; RUN=$3; NOTES=$4; DRY=${5:-}
REPO=${REPO:-philppplik/somnia}
API=https://api.github.com/repos/$REPO
if [ -z "${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_TOKEN_FILE:-}" ]; then GITHUB_TOKEN=$(cat "$GITHUB_TOKEN_FILE"); fi
[ -n "${GITHUB_TOKEN:-}" ] || { echo "no token" >&2; exit 2; }
[ -f "$NOTES" ] || { echo "notes file missing" >&2; exit 2; }
TAG=v$VERSION
gh_api() { curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

echo "== verify run $RUN"
gh_api "$API/actions/runs/$RUN" > /tmp/pub-run.json
[ "$(jq -r .head_sha /tmp/pub-run.json)" = "$SHA" ] || { echo "run did not build $SHA" >&2; exit 1; }
gh_api "$API/actions/runs/$RUN/jobs?per_page=50" > /tmp/pub-jobs.json
jq -r '.jobs[]|"\(.name) \(.conclusion)"' /tmp/pub-jobs.json
OK=$(jq '[.jobs[]|select(.name=="native" or .name=="macos" or .name=="windows" or .name=="frontend")|select(.conclusion=="success")]|length' /tmp/pub-jobs.json)
[ "$OK" = 4 ] || { echo "need 4/4 green jobs, have $OK" >&2; exit 1; }
if gh_api "$API/releases/tags/$TAG" >/dev/null 2>&1; then echo "release $TAG already exists" >&2; exit 1; fi

W=$(mktemp -d); OUT=$W/out; mkdir -p "$OUT"
echo "== download CI artifacts"
gh_api "$API/actions/runs/$RUN/artifacts?per_page=50" > /tmp/pub-art.json
for kind in windows-alpha macos-alpha linux-alpha; do
  ID=$(jq -r --arg k "somnia-$kind-" '.artifacts[]|select(.name|startswith($k))|.id' /tmp/pub-art.json | head -1)
  [ -n "$ID" ] || { echo "artifact $kind missing" >&2; exit 1; }
  curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -o "$W/$kind.zip" "$API/actions/artifacts/$ID/zip"
  mkdir -p "$W/$kind"; unzip -q "$W/$kind.zip" -d "$W/$kind"
done

echo "== name assets"
N=Somnia-$TAG
cp "$W"/windows-alpha/nsis/*_x64-setup.exe "$OUT/$N-x64-setup.exe"
cp "$W"/windows-alpha/msi/*.msi "$OUT/$N-x64.msi"
cp "$W"/macos-alpha/dmg/*.dmg "$OUT/$N-macos.dmg"
cp "$W"/macos-alpha/macos/Somnia.app.tar.gz "$OUT/$N-macos-aarch64.app.tar.gz"
cp "$W"/macos-alpha/macos-verification.txt "$OUT/macos-verification.txt"
cp "$W"/linux-alpha/src-tauri/target/release/bundle/appimage/*.AppImage "$OUT/$N-amd64.AppImage"
cp "$W"/linux-alpha/src-tauri/target/release/bundle/deb/*.deb "$OUT/$N-amd64.deb"
(cd "$OUT" && sha256sum Somnia-* > SHA256SUMS.txt && cat SHA256SUMS.txt)
ls -l "$OUT"

if [ "$DRY" = "--dry-run" ]; then echo "dry run: nothing published ($OUT)"; exit 0; fi

echo "== create pre-release $TAG at $SHA"
jq -n --arg tag "$TAG" --arg sha "$SHA" --arg name "Somnia $VERSION" --rawfile body "$NOTES" \
  '{tag_name:$tag,target_commitish:$sha,name:$name,body:$body,prerelease:true,draft:false,make_latest:"false"}' > "$W/release.json"
gh_api -X POST "$API/releases" -d @"$W/release.json" > "$W/created.json"
UPLOAD=$(jq -r .upload_url "$W/created.json" | sed 's/{.*//')
for f in "$OUT"/*; do
  echo "upload $(basename "$f")"
  curl -fsS -X POST -H "Authorization: Bearer $GITHUB_TOKEN" -H "Content-Type: application/octet-stream" \
    --data-binary @"$f" "$UPLOAD?name=$(basename "$f")" > /dev/null
done
jq -r .html_url "$W/created.json"
