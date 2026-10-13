#!/bin/sh
# Somnia CLI installer for Linux (x86_64). Non-interactive, idempotent.
# Uses only GitHub Release assets of philppplik/somnia and verifies SHA256SUMS before installing.
#   sh install.sh [--version vX.Y.Z[-pre]] [--prefix DIR] [--no-path]
# Environment: SOMNIA_VERSION, SOMNIA_PREFIX (same as the flags).
# SOMNIA_INSTALL_BASE overrides the download base URL and exists for tests only.
set -eu

REPO="philppplik/somnia"
VERSION="${SOMNIA_VERSION:-}"
PREFIX="${SOMNIA_PREFIX:-$HOME/.local}"
EDIT_PATH=1

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:?--version needs a tag}"; shift 2 ;;
    --prefix) PREFIX="${2:?--prefix needs a directory}"; shift 2 ;;
    --no-path) EDIT_PATH=0; shift ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "somnia-install: unknown option: $1" >&2; exit 2 ;;
  esac
done

die() { echo "somnia-install: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing required tool: $1"; }

OS="$(uname -s)"; ARCH="$(uname -m)"
case "$OS" in
  Linux) ;;
  Darwin) die "there is no macOS build of the Somnia CLI yet (Linux and Windows x86_64 only)" ;;
  *) die "unsupported system: $OS" ;;
esac
case "$ARCH" in x86_64|amd64) ;; *) die "unsupported CPU: $ARCH (x86_64 only)" ;; esac

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }
  fetch_out() { curl -fsSL --retry 3 "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q -O "$2" "$1"; }
  fetch_out() { wget -q -O - "$1"; }
else
  die "need curl or wget"
fi
need tar
if command -v sha256sum >/dev/null 2>&1; then sha() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
else die "need sha256sum or shasum"; fi

# Newest release (pre-releases included) that carries a Linux CLI archive, unless a tag is given.
if [ -z "$VERSION" ] && [ -z "${SOMNIA_INSTALL_BASE:-}" ]; then
  VERSION="$(fetch_out "https://api.github.com/repos/$REPO/releases?per_page=30" \
    | grep -o '"browser_download_url": *"[^"]*/download/[^/"]*/somnia-cli-[^"]*-linux-x86_64\.tar\.gz"' \
    | head -n 1 | sed 's|.*/download/\([^/"]*\)/.*|\1|')" || true
  [ -n "$VERSION" ] || die "no release with a Linux CLI archive found"
fi
BASE="${SOMNIA_INSTALL_BASE:-https://github.com/$REPO/releases/download/$VERSION}"
NUM="${VERSION#v}"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT INT TERM
if [ -n "${SOMNIA_INSTALL_BASE:-}" ]; then
  fetch "$BASE/SHA256SUMS" "$TMP/SHA256SUMS"
  ARCHIVE="$(grep -o 'somnia-cli-[^ ]*-linux-x86_64\.tar\.gz' "$TMP/SHA256SUMS" | head -n 1)"
  [ -n "$ARCHIVE" ] || die "no Linux archive listed in SHA256SUMS"
  NUM="$(echo "$ARCHIVE" | sed 's/^somnia-cli-//;s/-linux-x86_64\.tar\.gz$//')"
else
  ARCHIVE="somnia-cli-$NUM-linux-x86_64.tar.gz"
  fetch "$BASE/SHA256SUMS" "$TMP/SHA256SUMS"
fi
fetch "$BASE/$ARCHIVE" "$TMP/$ARCHIVE"

WANT="$(grep " \**$ARCHIVE\$" "$TMP/SHA256SUMS" | head -n 1 | cut -d' ' -f1)"
[ -n "$WANT" ] || die "$ARCHIVE is not listed in SHA256SUMS"
GOT="$(sha "$TMP/$ARCHIVE")"
[ "$WANT" = "$GOT" ] || die "checksum mismatch for $ARCHIVE (expected $WANT, got $GOT); nothing was installed"

tar -xzf "$TMP/$ARCHIVE" -C "$TMP"
SRC="$TMP/somnia-cli-$NUM-linux-x86_64"
[ -x "$SRC/somnia" ] && [ -f "$SRC/sidecar/engine.mjs" ] || die "archive layout is not as expected"

DEST="$PREFIX/share/somnia-cli"; BIN="$PREFIX/bin"
mkdir -p "$PREFIX/share" "$BIN"
rm -rf "$DEST.new" && mv "$SRC" "$DEST.new"
rm -rf "$DEST.old"; [ -d "$DEST" ] && mv "$DEST" "$DEST.old"
mv "$DEST.new" "$DEST" && rm -rf "$DEST.old"
ln -sf "$DEST/somnia" "$BIN/somnia"

MARK="# somnia-cli path"
if [ "$EDIT_PATH" = 1 ]; then
  case ":$PATH:" in *":$BIN:"*) ;; *)
    for rc in "$HOME/.profile" "$HOME/.bashrc" "$HOME/.zshrc"; do
      [ -f "$rc" ] || [ "$rc" = "$HOME/.profile" ] || continue
      grep -qF "$MARK" "$rc" 2>/dev/null || printf '\n%s\nexport PATH="%s:$PATH"\n' "$MARK" "$BIN" >> "$rc"
    done ;;
  esac
fi

echo "Somnia CLI $NUM installed: $BIN/somnia"
command -v git >/dev/null 2>&1 || echo "note: git was not found on PATH (required)" >&2
command -v node >/dev/null 2>&1 || echo "note: node 20 or newer was not found on PATH (required for the agent engine)" >&2
"$BIN/somnia" --version 2>/dev/null || true
