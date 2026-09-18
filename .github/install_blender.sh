#!/usr/bin/env bash
# Install Blender on the runner. apt is fastest from the GH mirror.
set -uo pipefail
OUT_DIR="${OUT_DIR:-probe}"
mkdir -p "$OUT_DIR"
LOG="$OUT_DIR/install.log"
: > "$LOG"

{
  echo "== apt install blender =="
  sudo apt-get update -qq
  sudo apt-get install -y -qq blender xvfb
  echo "exit: $?"
  blender --version 2>&1 | head -5
} 2>&1 | tee -a "$LOG"

if blender --version >/dev/null 2>&1; then
  echo "BLENDER_OK" | tee -a "$LOG"
  exit 0
fi
echo "BLENDER_MISSING" | tee -a "$LOG"
exit 1
