#!/usr/bin/env bash
# Install the newest stable official Blender (so a file saved by any recent
# Blender opens without an upgrade prompt), falling back to apt's package.
set -uo pipefail
OUT_DIR="${OUT_DIR:-probe}"
mkdir -p "$OUT_DIR"
LOG="$OUT_DIR/install.log"
: > "$LOG"

say() { echo "$*" | tee -a "$LOG"; }

install_from_tarball() {
  local base="https://download.blender.org/release/"
  say "== listing $base =="
  curl -sSL --max-time 60 "$base" \
    | grep -oE 'Blender[0-9]+\.[0-9]+/' | sort -u -V | tail -5 | tee -a "$LOG"
  local dir
  dir=$(curl -sSL --max-time 60 "$base" | grep -oE 'Blender[0-9]+\.[0-9]+/' | sort -u -V | tail -1)
  [ -z "$dir" ] && return 1
  say "== newest release dir: $dir =="
  local listing
  listing=$(curl -sSL --max-time 60 "$base$dir")
  local tgz
  tgz=$(echo "$listing" | grep -oE "blender-[0-9.]+-linux-x64\.tar\.xz" | sort -u -V | tail -1)
  [ -z "$tgz" ] && return 1
  say "== downloading $tgz =="
  curl -sSL --max-time 900 -o /tmp/blender.tar.xz "$base$dir$tgz" || return 1
  ls -l /tmp/blender.tar.xz | tee -a "$LOG"
  mkdir -p /opt/blender && tar -xJf /tmp/blender.tar.xz -C /opt/blender --strip-components=1 || return 1
  sudo ln -sf /opt/blender/blender /usr/local/bin/blender
  blender --version 2>&1 | head -3 | tee -a "$LOG"
  blender --version >/dev/null 2>&1
}

if install_from_tarball; then
  say "BLENDER_OK (official tarball)"
  exit 0
fi

say "== falling back to apt =="
{
  sudo apt-get update -qq
  sudo apt-get install -y -qq blender xvfb
  blender --version 2>&1 | head -5
} 2>&1 | tee -a "$LOG"

if blender --version >/dev/null 2>&1; then
  say "BLENDER_OK (apt)"
  exit 0
fi
say "BLENDER_MISSING"
exit 1
