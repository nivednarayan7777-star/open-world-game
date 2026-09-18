#!/usr/bin/env bash
# Download a model file from Google Drive (sandbox has no access to Drive, the
# runner does) and report exactly what landed, so a failure is diagnosable from
# the committed log. Works for .blend, .fbx, .obj, .gltf/.glb, .dae, .stl, .ply
# and zips containing any of those.
#
#   BLEND_ID   Drive file id (required)
#   OUT_DIR    where to write fetch.log (default: probe)
#   WORK       scratch dir (default: /tmp/model)
#
# Writes the resolved absolute path of the downloaded model to $WORK/path.txt so
# the probe script does not need to guess the extension.
set -uo pipefail

OUT_DIR="${OUT_DIR:-probe}"
WORK="${WORK:-/tmp/model}"
mkdir -p "$OUT_DIR" "$WORK"
LOG="$OUT_DIR/fetch.log"
: > "$LOG"

say() { echo "$*" | tee -a "$LOG"; }

if [ -z "${BLEND_ID:-}" ]; then
  say "no BLEND_ID given"
  exit 1
fi

RAW="$WORK/download.raw"
: > "$RAW"

describe() {
  local f="$1"
  say "--- check $f ---"
  ls -l "$f" 2>&1 | tee -a "$LOG"
  say "type: $(file -b "$f" 2>&1)"
  say "head bytes: $(head -c 24 "$f" | od -c | head -3 | tr '\n' ' ')"
  say "sha256: $(sha256sum "$f" | cut -d' ' -f1)"
}

# --- strategy 1: usercontent download (handles the virus-scan interstitial) ---
say "== strategy 1: curl usercontent =="
curl -sSL --max-time 600 -c "$WORK/cj" -b "$WORK/cj" \
  "https://drive.usercontent.google.com/download?id=$BLEND_ID&export=download&confirm=t" \
  -o "$RAW" -D "$WORK/dl1.headers"
say "curl exit: $?"
grep -i -E "^(http/|content-type|content-length|content-disposition)" "$WORK/dl1.headers" | tee -a "$LOG"
say "filename: $(grep -i '^content-disposition' "$WORK/dl1.headers" | sed 's/.*filename=//' | tr -d '\r')"

if [ ! -s "$RAW" ]; then
  # --- strategy 2: uc?export=download ---
  say "== strategy 2: curl uc?export=download =="
  curl -sSL --max-time 600 -c "$WORK/cj2" -b "$WORK/cj2" \
    "https://drive.google.com/uc?export=download&id=$BLEND_ID" -o "$RAW" -D "$WORK/dl2.headers"
  say "curl exit: $?"
  grep -i -E "^(http/|content-type|content-length|content-disposition)" "$WORK/dl2.headers" | tee -a "$LOG"
fi

if [ ! -s "$RAW" ]; then
  # --- strategy 3: gdown ---
  say "== strategy 3: gdown =="
  python3 -m pip install --quiet --disable-pip-version-check gdown 2>&1 | tail -2 | tee -a "$LOG" \
    || python3 -m pip install --quiet --break-system-packages gdown 2>&1 | tail -2 | tee -a "$LOG"
  python3 -m gdown --id "$BLEND_ID" -O "$RAW" 2>&1 | tee -a "$LOG"
  say "gdown exit: $?"
fi

if [ ! -s "$RAW" ]; then
  say "ALL STRATEGIES FAILED — nothing downloaded"
  exit 1
fi

describe "$RAW"

# --- if it is an HTML interstitial rather than a file, say so plainly --------
if head -c 400 "$RAW" | grep -qi -E "<html|<!doctype"; then
  say "VERDICT: got an HTML page, not a file (Drive refused the download)"
  say "first 400 chars:"
  head -c 400 "$RAW" | tee -a "$LOG"
  say ""
  exit 1
fi

# --- unzip if needed, then pick the model inside ----------------------------
PICK=""
if head -c 4 "$RAW" | grep -q "PK"; then
  say "== unzipping =="
  rm -rf "$WORK/uz"
  mkdir -p "$WORK/uz"
  unzip -o -q "$RAW" -d "$WORK/uz" 2>&1 | tee -a "$LOG"
  ls -la "$WORK/uz" | tee -a "$LOG"
  PICK=$(find "$WORK/uz" -type f \( -iname "*.blend" \) -printf "%s %p\n" | sort -rn | head -1 | cut -d' ' -f2-)
  if [ -z "$PICK" ]; then
    PICK=$(find "$WORK/uz" -type f \( -iname "*.glb" -o -iname "*.gltf" -o -iname "*.fbx" -o -iname "*.obj" \) \
      -printf "%s %p\n" | sort -rn | head -1 | cut -d' ' -f2-)
  fi
else
  PICK="$RAW"
fi

if [ -z "$PICK" ]; then
  say "no usable model inside the download"
  exit 1
fi

EXT="${PICK##*.}"
EXT_LOWER=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')
DEST="$WORK/source.$EXT_LOWER"
cp "$PICK" "$DEST"
echo "$DEST" > "$WORK/path.txt"

KIND="unknown"
case "$EXT_LOWER" in
  blend) KIND="blend" ;;
  fbx|obj|gltf|glb|dae|stl|ply|usdc|usd|abc) KIND="import" ;;
esac

say "CHOSEN: $DEST ($(stat -c%s "$DEST") bytes, kind=$KIND)"

{
  echo "kind=$KIND"
  echo "path=$DEST"
  echo "ext=$EXT_LOWER"
} >> "${GITHUB_OUTPUT:-/dev/null}"

[ "$KIND" != "unknown" ]
