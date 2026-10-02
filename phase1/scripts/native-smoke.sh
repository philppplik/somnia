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
# Verify native command registration and folder-picker rendering separately from startup.
xdotool key --window "$window" ctrl+k
xdotool type --window "$window" --clearmodifiers 'Open folder'
sleep 1
import -window "$window" validation/native/native-open-command.png
xdotool key --window "$window" Return
sleep 1
# The bundled in-memory sample is dirty; accept replacement for this test only.
xdotool key Return
sleep 2
import -window root validation/native/native-folder-dialog.png
xdotool key Escape
kill -0 "$app_pid"
printf 'Native process survived startup and palette/split keyboard smoke. PNGs require human pixel inspection; this is not file-save/recovery or final OS acceptance.\n' >validation/native/RESULT.txt
