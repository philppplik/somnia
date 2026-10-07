#!/bin/bash
# Diagnose the exact previous public asset. Does not gate the new build.
set -euo pipefail
root=src-tauri/target/release/bundle
mkdir -p "$root"
exec > >(tee "$root/macos-previous-dmg.txt") 2>&1
scratch=$(mktemp -d)
mount="$scratch/mount"
mkdir "$mount"
cleanup() { hdiutil detach "$mount" >/dev/null 2>&1 || true; rm -rf "$scratch"; }
trap cleanup EXIT
curl --fail --location --retry 2 -o "$scratch/old.dmg" https://github.com/philppplik/somnia/releases/download/v11.1.0/Somnia-v11.1.0-macos.dmg
shasum -a 256 "$scratch/old.dmg"
hdiutil verify "$scratch/old.dmg"
hdiutil attach -readonly -nobrowse -mountpoint "$mount" "$scratch/old.dmg"
app=("$mount"/*.app)
set +e
codesign -d --verbose=4 "${app[0]}" 2>&1
codesign --verify --deep --strict --verbose=4 "${app[0]}"
spctl --assess --type execute --verbose=4 "${app[0]}"
set -e
echo 'Previous DMG diagnosis complete. No quarantine removal or bypass applied.'
