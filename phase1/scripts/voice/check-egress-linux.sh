#!/usr/bin/env bash
set -euo pipefail
root=$(realpath phase1/dist-voice)
mkdir -p "$root/evidence"
helper="$root/helper/whisper-cli"
chmod 700 "$helper"
# All inference and hostile probes run in an isolated network namespace. No download in it.
# A syscall trace catches attempted IP sockets, including DNS/IPv6/loopback, not just successful traffic.
negative="$root/evidence/negative.trace"
unshare --net -- strace -f -e trace=network -o "$negative" node phase1/scripts/voice/network-negative.mjs
if ! grep -Eq 'AF_INET6?|sin6?_port' "$negative"; then echo 'Negative control did not produce traceable network attempts' >&2; exit 1; fi
for language in de en; do
  trace="$root/evidence/helper-$language.trace"
  unshare --net -- strace -f -e trace=network -o "$trace" "$helper" -m "$root/ggml-base.bin" -f "$root/synthetic.wav" -l "$language" -ng -np -nt -otxt -of "$root/evidence/transcript-$language" >"$root/evidence/helper-$language.log" 2>&1
  if grep -Eq 'AF_INET6?|sin6?_port' "$trace"; then echo 'Helper attempted IP networking during inference' >&2; exit 1; fi
done
printf '%s\n' '{"testBoundary":"Linux network namespace + network syscalls","negativeControlDetected":true,"syntheticDEEN":true,"productionIsolationProven":false,"releaseReady":false}' > "$root/evidence/egress-result.json"
