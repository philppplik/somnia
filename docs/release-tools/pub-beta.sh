#!/bin/sh
# Usage: pub-beta.sh <version> <full-sha> <run-id> <notes.md> [--dry-run]
# GitHub pre-release only. Does not publish updater manifests or Store packages.
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$HERE/publish.sh" beta "$@"
