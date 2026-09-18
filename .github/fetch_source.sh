#!/usr/bin/env bash
# Download a model file from Google Drive (the sandbox has no access to Drive,
# the runner does) and report exactly what landed, so a failure is diagnosable
# from the committed log. Works for .blend, .fbx, .obj, .gltf/.glb, .dae, .stl,
# .ply and zips containing any of those.
#
# Drive hands the bytes over as "download.raw" whatever the real file is, so the
# format is sniffed from the magic bytes first and the Content-Disposition name
# second — never from the URL.
#
#   BLEND_ID   Drive file id (required)
#   OUT_DIR    where to write fetch.log (default: probe)
#   WORK       scratch dir (default: /tmp/model)
#
# Writes the resolved absolute path of the downloaded model to $WORK/path.txt so
# the probe script does not need to guess the extension.
set -uo pipefail

OUT_DIR="${OUT_DIR:-probe/model}"
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

say "== strategy 1: curl usercontent =="
curl -sSL --max-time 600 -c "$WORK/cj" -b "$WORK/cj" \
  "https://drive.usercontent.google.com/download?id=$BLEND_ID&export=download&confirm=t" \
  -o "$RAW" -D "$WORK/dl1.headers"
say "curl exit: $?"
grep -i -E "^(http/|content-type|content-length|content-disposition)" "$WORK/dl1.headers" >> "$LOG" 2>/dev/null
say "drive says filename: $(grep -i '^content-disposition' "$WORK/dl1.headers" 2>/dev/null | sed 's/.*filename=//' | tr -d '"\r')"

if [ ! -s "$RAW" ]; then
  say "== strategy 2: curl uc?export=download =="
  curl -sSL --max-time 600 -c "$WORK/cj2" -b "$WORK/cj2" \
    "https://drive.google.com/uc?export=download&id=$BLEND_ID" -o "$RAW" -D "$WORK/dl2.headers"
  say "curl exit: $?"
  grep -i -E "^(http/|content-type|content-length|content-disposition)" "$WORK/dl2.headers" >> "$LOG" 2>/dev/null
fi

if [ ! -s "$RAW" ]; then
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

say "--- what landed ---"
ls -l "$RAW" | tee -a "$LOG"
say "type: $(file -b "$RAW" 2>&1)"
say "head bytes: $(head -c 24 "$RAW" | od -c | head -3 | tr '\n' ' ')"
say "sha256: $(sha256sum "$RAW" | cut -d' ' -f1)"

if head -c 400 "$RAW" | grep -qi -E "<html|<!doctype"; then
  say "VERDICT: got an HTML page, not a file (Drive refused the download)"
  head -c 400 "$RAW" | tee -a "$LOG"
  say ""
  exit 1
fi

# --- sniff the real format ---------------------------------------------------
sniff_ext() {
  local f="$1"
  local head_raw head_txt
  head_raw=$(head -c 32 "$f" | tr -d '\0')
  head_txt=$(head -c 4000 "$f")
  case "$head_raw" in
    BLENDER*) echo blend; return ;;
    glTF*)    echo glb;   return ;;
    "Kaydara FBX Binary"*) echo fbx; return ;;
    PK*)      echo zip;   return ;;
    ply*)     echo ply;   return ;;
  esac
  if head -c 200 "$f" | grep -qi "^#.*blender"; then echo blend; return; fi
  if echo "$head_txt" | grep -qi "facet normal"; then echo stl; return; fi
  if echo "$head_txt" | grep -qE "^v[[:space:]]+-?[0-9]"; then echo obj; return; fi
  if echo "$head_txt" | grep -qi '"asset".*"version"'; then echo gltf; return; fi
  echo ""
}

CD_EXT=$(grep -i '^content-disposition' "$WORK"/dl*.headers 2>/dev/null | sed 's/.*filename=//' \
  | tr -d '"\r' | sed 's/.*\.//' | tr '[:upper:]' '[:lower:]' | head -1)
SNIFF=$(sniff_ext "$RAW")
say "sniffed: '${SNIFF:-?}'  from drive filename: '${CD_EXT:-?}'"

# magic bytes win; the Drive filename is the fallback for ascii formats
if [ -n "$SNIFF" ]; then EXT_LOWER="$SNIFF"; else EXT_LOWER="$CD_EXT"; fi

if [ "$EXT_LOWER" = "zip" ]; then
  say "== unzipping =="
  rm -rf "$WORK/uz" && mkdir -p "$WORK/uz"
  unzip -o -q "$RAW" -d "$WORK/uz" 2>&1 | tee -a "$LOG"
  ls -la "$WORK/uz" | tee -a "$LOG"
  PICK=$(find "$WORK/uz" -type f -iname "*.blend" -printf "%s %p\n" | sort -rn | head -1 | cut -d' ' -f2-)
  if [ -z "$PICK" ]; then
    PICK=$(find "$WORK/uz" -type f \( -iname "*.glb" -o -iname "*.gltf" -o -iname "*.fbx" \
      -o -iname "*.obj" \) -printf "%s %p\n" | sort -rn | head -1 | cut -d' ' -f2-)
  fi
  [ -z "$PICK" ] && { say "no usable model inside the zip"; exit 1; }
  EXT_LOWER=$(echo "${PICK##*.}" | tr '[:upper:]' '[:lower:]')
else
  PICK="$RAW"
fi

if [ -z "$EXT_LOWER" ]; then
  say "VERDICT: could not tell what this file is; refusing to probe it"
  exit 1
fi

DEST="$WORK/source.$EXT_LOWER"
cp "$PICK" "$DEST"
echo "$DEST" > "$WORK/path.txt"

case "$EXT_LOWER" in
  blend) KIND="blend" ;;
  gltf|glb|fbx|obj|dae|stl|ply|usd|usdc|usda|abc) KIND="import" ;;
  *) KIND="unknown" ;;
esac

say "CHOSEN: $DEST ($(stat -c%s "$DEST") bytes, kind=$KIND)"

{
  echo "kind=$KIND"
  echo "path=$DEST"
  echo "ext=$EXT_LOWER"
} >> "${GITHUB_OUTPUT:-/dev/null}"

[ "$KIND" != "unknown" ]
