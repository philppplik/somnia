#!/bin/bash
# macOS CI: validate image, sealed app signature, architecture, and archive.
# Gatekeeper rejection is expected for an ad-hoc, non-notarized beta.
set -euo pipefail
root=src-tauri/target/release/bundle
report="$root/macos-verification.txt"
mkdir -p "$root"
exec > >(tee "$report") 2>&1
verify_app() {
  local app="$1"
  codesign --verify --deep --strict --verbose=4 "$app"
  codesign -d --verbose=4 "$app" 2>&1
  # A linker-only signature leaves Info.plist and resources unsealed.
  local info
  info=$(codesign -d --verbose=4 "$app" 2>&1)
  if echo "$info" | grep -Eq 'Info.plist=not bound|Sealed Resources=none'; then
    echo 'ERROR: app bundle is not sealed'; return 1
  fi
  file "$app/Contents/MacOS/somnia"
  /usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Contents/Info.plist"
  set +e
  spctl --assess --type execute --verbose=4 "$app"
  local result=$?
  set -e
  echo "Gatekeeper exit: $result (rejection expected: ad-hoc, not notarized)"
}
apps=("$root"/macos/*.app)
verify_app "${apps[0]}"
mount=$(mktemp -d)
cleanup() { hdiutil detach "$mount" >/dev/null 2>&1 || true; rmdir "$mount" 2>/dev/null || true; }
trap cleanup EXIT
for dmg in "$root"/dmg/*.dmg; do
  hdiutil verify "$dmg"
  hdiutil attach -readonly -nobrowse -mountpoint "$mount" "$dmg"
  mounted=("$mount"/*.app)
  verify_app "${mounted[0]}"
  hdiutil detach "$mount"
done
for archive in "$root"/macos/*.app.tar.gz; do
  [ -e "$archive" ] || continue
  unpack=$(mktemp -d)
  tar -xzf "$archive" -C "$unpack"
  archived=("$unpack"/*.app)
  verify_app "${archived[0]}"
  rm -rf "$unpack"
done
echo 'PASS: DMG integrity and sealed signatures (bundle, mounted DMG, updater archive).'
echo 'NOT TESTED: downloaded quarantine flow or launch on the maintainer Mac.'
