#!/usr/bin/env bash
set -euo pipefail
mkdir -p validation/native
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export LIBGL_ALWAYS_SOFTWARE=1
src-tauri/target/release/somnia >validation/native/app.log 2>&1 &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true' EXIT
window=$(timeout 40 xdotool search --sync --onlyvisible --name '^Somnia$')
window=${window%%$'\n'*}
test -n "$window"
kill -0 "$app_pid"
xdotool windowfocus --sync "$window"
sleep 3
import -window "$window" validation/native/startup.png
xdotool key --window "$window" ctrl+k
sleep 1
import -window "$window" validation/native/command-palette.png
xdotool key --window "$window" Escape
xdotool key --window "$window" ctrl+3
sleep 1
import -window "$window" validation/native/split-source.png
kill -0 "$app_pid"
printf 'Native process survived startup and palette/split keyboard smoke. PNGs require human pixel inspection; this is not file-save/recovery or final OS acceptance.\n' >validation/native/RESULT.txt
