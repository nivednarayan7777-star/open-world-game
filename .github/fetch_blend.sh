#!/usr/bin/env bash
# Download the user's .blend from Google Drive. Tries several strategies and
# logs everything, so a failure is diagnosable from the committed report.
set -uo pipefail

OUT_DIR="${OUT_DIR:-probe}"
mkdir -p "$OUT_DIR" /tmp/blend
LOG="$OUT_DIR/fetch.log"
: > "$LOG"

say() { echo "$*" | tee -a "$LOG"; }

TARGET=/tmp/blend/source.blend
: > "$TARGET"

check() {
  local f="$1"
  say "--- check $f ---"
  ls -l "$f" 2>&1 | tee -a "$LOG"
  say "type: $(file -b "$f" 2>&1)"
  say "head bytes: $(head -c 16 "$f" | od -c | head -2 | tr '\n' ' ')"
  if head -c 7 "$f" | grep -q "BLENDER"; then
    say "VERDICT: valid .blend"
    return 0
  fi
  say "VERDICT: not a .blend"
  say "first 400 chars:"
  head -c 400 "$f" | tee -a "$LOG"
  say ""
  return 1
}

# --- strategy 1: plain curl (works for small public files) -------------------
say "== strategy 1: curl usercontent =="
curl -sSL --max-time 180 -c /tmp/cj -b /tmp/cj \
  "https://drive.usercontent.google.com/download?id=$BLEND_ID&export=download&confirm=t" \
  -o "$TARGET" -D /tmp/dl.headers
say "curl exit: $?"
say "headers:"; cat /tmp/dl.headers | tee -a "$LOG"
if check "$TARGET"; then exit 0; fi

# --- strategy 2: uc?export=download -----------------------------------------
say "== strategy 2: curl uc?export=download =="
curl -sSL --max-time 180 -c /tmp/cj2 -b /tmp/cj2 \
  "https://drive.google.com/uc?export=download&id=$BLEND_ID" -o "$TARGET" -D /tmp/dl2.headers
say "curl exit: $?"
cat /tmp/dl2.headers | tee -a "$LOG"
if check "$TARGET"; then exit 0; fi

# --- strategy 3: gdown -------------------------------------------------------
say "== strategy 3: gdown =="
python3 -m pip install --quiet --disable-pip-version-check gdown 2>&1 | tee -a "$LOG" \
  || python3 -m pip install --quiet --break-system-packages gdown 2>&1 | tee -a "$LOG" \
  || pipx run gdown --help 2>&1 | tee -a "$LOG"
python3 -m gdown --id "$BLEND_ID" -O "$TARGET" 2>&1 | tee -a "$LOG"
say "gdown exit: $?"
if check "$TARGET"; then exit 0; fi

say "ALL STRATEGIES FAILED"
exit 1
