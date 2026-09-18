#!/usr/bin/env bash
# Run the model probe on the downloaded file and collect everything it made.
#
#   MODEL_OUT   where results land (default: probe/model)
#   WORK        scratch dir with path.txt (default: /tmp/model)
set -uo pipefail
MODEL_OUT="${MODEL_OUT:-probe/model}"
WORK="${WORK:-/tmp/model}"
mkdir -p "$MODEL_OUT" "$WORK"
LOG="$MODEL_OUT/run.log"
: > "$LOG"

SRC="$(cat "$WORK/path.txt" 2>/dev/null || true)"
echo "source: $SRC" | tee -a "$LOG"

if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
  echo "no source file to probe" | tee -a "$LOG"
  exit 1
fi

if [ "${SRC##*.}" = "blend" ]; then
  CMD=(blender -b "$SRC" -noaudio --python .github/model_probe.py)
else
  CMD=(blender -b -noaudio --python .github/model_probe.py -- "$SRC")
fi

echo "running: ${CMD[*]}" | tee -a "$LOG"
xvfb-run -a "${CMD[@]}" > /tmp/model_raw.log 2>&1
echo "blender exit: $?" | tee -a "$LOG"

# Blender writes C-level noise to stderr while python stdout is buffered; keep
# the raw log and the marker-free version for reading.
cp /tmp/model_raw.log "$MODEL_OUT/blender_raw.log"
grep -E "^(SOURCE|wrote|rendered|GRID|geometry|opengl|per-object|render engine|bounds|MODEL_PROBE)" \
  /tmp/model_raw.log | tail -80 | tee -a "$LOG"

ls -la "$MODEL_OUT" | tee -a "$LOG"
exit 0
