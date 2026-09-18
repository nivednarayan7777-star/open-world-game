#!/usr/bin/env python3
"""Split ===MARKER_BEGIN=== payload ===MARKER_END=== blocks out of a log."""
import base64
import os
import sys

raw_path = sys.argv[1]
out_dir = sys.argv[2]
os.makedirs(out_dir, exist_ok=True)

with open(raw_path, "r", errors="replace") as fh:
    lines = fh.read().split("\n")

marker = None
buf = []
found = []
for line in lines:
    if line.startswith("===") and line.endswith("_BEGIN==="):
        marker = line.strip("=").replace("_BEGIN", "")
        buf = []
        continue
    if line.startswith("===") and line.endswith("_END==="):
        name = marker
        marker = None
        text = "\n".join(buf)
        found.append(name)
        if name.startswith("VIEW_"):
            path = os.path.join(out_dir, "%s.png" % name.lower())
            try:
                with open(path, "wb") as fh2:
                    fh2.write(base64.b64decode(text))
                print("wrote", path, os.path.getsize(path))
            except Exception as exc:  # noqa: BLE001
                print("decode failed", name, exc)
        else:
            path = os.path.join(out_dir, "%s.json" % name.lower())
            with open(path, "w") as fh2:
                fh2.write(text)
            print("wrote", path, len(text))

# Keep the human-readable parts of the log too (drop the base64 payloads).
keep = []
marker = None
for line in lines:
    if line.startswith("===") and line.endswith("_BEGIN==="):
        marker = line
        continue
    if line.startswith("===") and line.endswith("_END==="):
        marker = None
        continue
    if marker is None:
        keep.append(line)
with open(os.path.join(out_dir, "blender_stdout.txt"), "w") as fh:
    fh.write("\n".join(keep))

print("markers found:", found)
