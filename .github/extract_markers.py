#!/usr/bin/env python3
"""Split ===MARKER_BEGIN=== payload ===MARKER_END=== blocks out of a log.

Blender writes C-level progress to stderr while python stdout is buffered, so
payload lines can be interleaved with progress text; the extractor joins every
line between the markers and reports what it found.
"""
import base64
import os
import re
import sys

raw_path = sys.argv[1]
out_dir = sys.argv[2]
os.makedirs(out_dir, exist_ok=True)

with open(raw_path, "r", errors="replace") as fh:
    lines = fh.read().split("\n")

begin_re = re.compile(r"^===([A-Z0-9_]+)_BEGIN===$")
end_re = re.compile(r"^===([A-Z0-9_]+)_END===$")


def save(name, text):
    text = text.strip()
    if name.startswith("VIEW_"):
        path = os.path.join(out_dir, "%s.png" % name.lower())
        try:
            with open(path, "wb") as fh2:
                fh2.write(base64.b64decode(text))
            print("wrote", path, os.path.getsize(path))
        except Exception as exc:  # noqa: BLE001
            print("decode failed", name, exc)
    elif name.startswith("GRID_"):
        path = os.path.join(
            out_dir, "grid_%s.json" % name[len("GRID_"):].lower().replace("_", "."))
        with open(path, "w") as fh2:
            fh2.write(text)
        print("wrote", path, len(text))
    else:
        path = os.path.join(out_dir, "%s.json" % name.lower())
        with open(path, "w") as fh2:
            fh2.write(text)
        print("wrote", path, len(text))


found = []
current = None
buf = []
clean = []
for line in lines:
    m = begin_re.match(line.strip())
    if m:
        if current:
            save(current, "\n".join(buf))
        current, buf = m.group(1), []
        found.append(current)
        clean.append("<%s payload>" % current)
        continue
    m = end_re.match(line.strip())
    if m:
        save(current or m.group(1), "\n".join(buf))
        current, buf = None, []
        continue
    if current:
        buf.append(line)
    else:
        clean.append(line)

with open(os.path.join(out_dir, "blender_stdout.txt"), "w") as fh:
    fh.write("\n".join(clean))

print("markers found:", found)
