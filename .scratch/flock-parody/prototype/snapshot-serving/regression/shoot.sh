#!/bin/bash
# PROTOTYPE (wayfinder ticket 05) — screenshots for the regression check.
#
# Per viewport, three renders through the SAME chromium (same image, same flags),
# so pixel diffs measure content, not renderer drift (control: identical renders = 0 px):
#   raw-<vp>.png    the raw SingleFile snapshot over file://  (ground truth + strip-list extras)
#   srvfile-<vp>.png the pipeline output over file://          (same bytes the server reads)
#   srvhttp-<vp>.png the pipeline output over http            (what a visitor gets)
# Checks (diff.mjs):
#   SERVING GATE: srvhttp vs srvfile  → must be ~0 (the serving layer is pixel-invisible)
#   STRIP REPORT: raw vs srvhttp      → expected non-zero, confined to the strip list
#     (homepage: Qualified offer bar top, OneTrust consent card bottom-left, 52px header-offset reflow)
# Requires: dev server running (PORT), colima up.
set -euo pipefail

PORT="${PORT:-3000}"
RUN="${RUN:-$(cd "$(dirname "$0")/../../../research/flocksafety/2026-09-09" && pwd)}"
OUT="$(cd "$(dirname "$0")" && pwd)/shots"
IMAGE="capsulecode/singlefile:latest"
CHROME=/usr/bin/chromium-browser
PAGE="${PAGE:-/}"   # which page to shoot (capture file + served URL)
SERVED_DIR="$(cd "$(dirname "$0")" && pwd)/../served"

mkdir -p "$OUT"

# served side must be reachable before burning container starts
curl -sf -o /dev/null "http://localhost:$PORT$PAGE" || { echo "served side not reachable at http://localhost:$PORT$PAGE — start the dev server first"; exit 1; }

# capture-side file:// path: '/' → index.html, '/x' → x.html
REL="${PAGE#/}"; [ -z "$REL" ] && REL="index.html" || REL="$REL.html"

shot() { # $1 outfile, $2 mountdir, $3 url
  docker run --rm --entrypoint "$CHROME" \
    -v "$2:/capsule:ro" -v "$OUT:/shots" "$IMAGE" \
    --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --hide-scrollbars \
    --force-color-profile=srgb --force-device-scale-factor=1 \
    --window-size="$4" --virtual-time-budget=8000 --timeout=30000 \
    --screenshot="/shots/$1.png" "$3" >/dev/null 2>&1
}

for WH in 1440,900 768,1024 390,844; do
  TAG="${WH/,/x}"
  echo "— $TAG"
  shot "raw_$TAG"     "$RUN"        "file:///capsule/$REL" "$WH"
  shot "srvfile_$TAG" "$SERVED_DIR" "file:///capsule/$REL" "$WH"
  # http side: the container reaches the host dev server via host.docker.internal
  shot "srvhttp_$TAG" "$OUT"        "http://host.docker.internal:$PORT$PAGE" "$WH"
done

ls -la "$OUT"
