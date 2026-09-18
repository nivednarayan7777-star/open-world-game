#!/usr/bin/env bash
# Run the Blender probe script and collect everything it produced.
set -uo pipefail
OUT_DIR="${OUT_DIR:-probe}"
mkdir -p "$OUT_DIR"
LOG="$OUT_DIR/probe.log"
: > "$LOG"

xvfb-run -a blender -b /tmp/blend/source.blend -noaudio --python .github/blend_probe.py \
  > "/tmp/probe.raw" 2>&1
echo "blender exit: $?" | tee -a "$LOG"
cat /tmp/probe.raw >> "$LOG"

# Split the markers out of the raw log into separate files.
python3 .github/extract_markers.py /tmp/probe.raw "$OUT_DIR" 2>&1 | tee -a "$LOG"
ls -la "$OUT_DIR" | tee -a "$LOG"
