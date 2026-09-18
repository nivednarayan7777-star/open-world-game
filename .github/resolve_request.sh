#!/usr/bin/env bash
# Resolve what this probe run should fetch.
#
# A push-triggered run reads .github/probe-request.json (so "please probe this
# Drive file" is a normal commit); a workflow_dispatch run falls back to the
# inputs the caller passed. Values are exported to later steps via $GITHUB_ENV.
set -uo pipefail

REQ="${PROBE_REQUEST:-.github/probe-request.json}"

pick() { # pick <json key> <fallback>
  local key="$1" fallback="${2:-}"
  if [ -f "$REQ" ]; then
    local v
    v=$(python3 -c "import json;print(json.load(open('$REQ')).get('$key') or '')" 2>/dev/null || true)
    if [ -n "$v" ]; then echo "$v"; return; fi
  fi
  echo "$fallback"
}

BLEND_ID="$(pick blend_id "${IN_BLEND_ID:-}")"
OUT_DIR="$(pick out_dir "${IN_OUT_DIR:-}")"
PROBE_SCRIPT="$(pick probe_script "${IN_PROBE_SCRIPT:-}")"
BLENDER_KIND="$(pick blender "${IN_BLENDER_KIND:-}")"

: "${OUT_DIR:=probe/model}"
: "${PROBE_SCRIPT:=.github/model_probe.py}"
: "${BLENDER_KIND:=latest}"

say() { echo "$*"; }
say "== request =="
if [ -f "$REQ" ]; then say "$(cat "$REQ")"; else say "(no $REQ; using dispatch inputs)"; fi
say "blend_id: ${BLEND_ID:-<missing>}"
say "out_dir: $OUT_DIR"
say "probe_script: $PROBE_SCRIPT"
say "blender: $BLENDER_KIND"

{
  echo "BLEND_ID=$BLEND_ID"
  echo "OUT_DIR=$OUT_DIR"
  echo "MODEL_OUT=$OUT_DIR"
  echo "PROBE_SCRIPT=$PROBE_SCRIPT"
  echo "BLENDER_KIND=$BLENDER_KIND"
} >> "$GITHUB_ENV"

if [ -z "$BLEND_ID" ]; then
  say "no blend_id to probe"
  exit 1
fi
