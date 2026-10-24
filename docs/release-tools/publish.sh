#!/bin/sh
# Shared beta/stable publisher. Run only after the owner authorizes the channel.
# Usage: publish.sh <beta|stable> <version> <sha> <run-id> <notes.md> [--dry-run]
set -eu
[ $# -ge 5 ] || { echo 'need channel version sha run-id notes [--dry-run]' >&2; exit 2; }
CHANNEL=$1; VERSION=$2; SHA=$3; RUN=$4; NOTES=$5; DRY=${6:-}
case "$CHANNEL" in beta|stable) ;; *) exit 2;; esac
REPO=${REPO:-philppplik/somnia}; API=https://api.github.com/repos/$REPO
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -z "${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_TOKEN_FILE:-}" ]; then GITHUB_TOKEN=$(cat "$GITHUB_TOKEN_FILE"); fi
[ -n "${GITHUB_TOKEN:-}" ] || { echo 'no token' >&2; exit 2; }
[ -f "$NOTES" ] || { echo 'notes missing' >&2; exit 2; }
# Validate shell parameters before URLs or filenames are built.
node --input-type=module - "$VERSION" "$CHANNEL" "$HERE/../../phase1/scripts/package-cli.mjs" <<'JS'
import { pathToFileURL } from 'node:url';
const [, , v, channel, source] = process.argv;
const { assertVersion } = await import(pathToFileURL(source)); assertVersion(v);
if ((channel === 'stable') === v.includes('-')) throw Error('channel does not match version');
JS
case "$SHA" in *[!0-9a-f]*|'') echo 'invalid SHA' >&2; exit 2;; esac
[ ${#SHA} -eq 40 ] || { echo 'need full SHA' >&2; exit 2; }
case "$RUN" in *[!0-9]*|'') exit 2;; esac
TAG=v$VERSION
W=$(mktemp -d); OUT=$W/out
trap 'rm -rf "$W"' 0 HUP INT TERM
gh_api() { curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$@"; }
gh_api "$API" > "$W/repo.json"
[ "$(jq -r .visibility "$W/repo.json")" = public ] || { echo 'public repository required' >&2; exit 1; }
gh_api "$API/actions/runs/$RUN" > "$W/run.json"
gh_api "$API/actions/runs/$RUN/jobs?per_page=100" > "$W/jobs.json"
node "$HERE/assemble-assets.mjs" verify "$VERSION" "$W/run.json" "$W/jobs.json" "$SHA"
if gh_api "$API/releases/tags/$TAG" >/dev/null 2>&1; then echo 'release already exists' >&2; exit 1; fi
gh_api "$API/actions/runs/$RUN/artifacts?per_page=100" > "$W/art.json"
[ "$(jq -r .total_count "$W/art.json")" -le 100 ] || { echo 'artifact pagination required' >&2; exit 1; }
KINDS='windows-alpha macos-alpha linux-alpha'
if [ "$(node "$HERE/../../phase1/scripts/release-platforms.mjs" "$VERSION" --full | head -1)" = arm=true ]; then KINDS="$KINDS windows-arm64-alpha linux-arm64-alpha"; fi
for kind in $KINDS; do
  NAME=somnia-$kind-$SHA
  COUNT=$(jq --arg name "$NAME" '[.artifacts[] | select(.name==$name and .expired==false)] | length' "$W/art.json")
  [ "$COUNT" = 1 ] || { echo "need exactly one artifact: $NAME" >&2; exit 1; }
  ID=$(jq -r --arg name "$NAME" '.artifacts[] | select(.name==$name and .expired==false) | .id' "$W/art.json")
  curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -o "$W/$kind.zip" "$API/actions/artifacts/$ID/zip"
  mkdir "$W/$kind"; unzip -q "$W/$kind.zip" -d "$W/$kind"
done
mkdir "$W/cli"
jq -r --arg sha "$SHA" '.artifacts[] | select(.expired==false and (.name | test("^somnia-cli-(Linux|Windows)-(x64|arm64)-" + $sha + "$"))) | .id' "$W/art.json" > "$W/cli-ids"
while IFS= read -r ID; do
  curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -o "$W/cli-$ID.zip" "$API/actions/artifacts/$ID/zip"
  mkdir "$W/cli/$ID"; unzip -q "$W/cli-$ID.zip" -d "$W/cli/$ID"
done < "$W/cli-ids"
node "$HERE/assemble-assets.mjs" assemble "$VERSION" "$W" "$OUT"
(cd "$OUT" && sha256sum -c SHA256SUMS.txt)
ls -l "$OUT"
if [ "$DRY" = --dry-run ]; then echo 'dry run: validated, nothing published'; exit 0; fi
PRERELEASE=true; LATEST=false
if [ "$CHANNEL" = stable ]; then PRERELEASE=false; LATEST=true; fi
jq -n --arg tag "$TAG" --arg sha "$SHA" --arg name "Somnia $VERSION" --rawfile body "$NOTES" --argjson pre "$PRERELEASE" --arg latest "$LATEST" \
  '{tag_name:$tag,target_commitish:$sha,name:$name,body:$body,prerelease:$pre,draft:false,make_latest:$latest}' > "$W/release.json"
gh_api -X POST "$API/releases" -d @"$W/release.json" > "$W/created.json"
UPLOAD=$(jq -r .upload_url "$W/created.json" | sed 's/{.*//')
for f in "$OUT"/*; do
  curl -fsS -X POST -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Content-Type: application/octet-stream' --data-binary @"$f" "$UPLOAD?name=$(basename "$f")" > /dev/null
done
jq -r .html_url "$W/created.json"
