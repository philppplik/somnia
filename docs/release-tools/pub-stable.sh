#!/bin/sh
# Usage: pub-stable.sh <version> <full-sha> <run-id> <notes.md> [--dry-run]
# Stable requires the owner's tested-build approval. No Store submission.
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$HERE/publish.sh" stable "$@"
