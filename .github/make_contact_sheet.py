#!/usr/bin/env python3
"""Tile every obj_*.png render into one contact sheet, with labels, so forty
models can be compared in a single image."""
import glob
import os
import sys

from PIL import Image, ImageDraw

out_dir = sys.argv[1] if len(sys.argv) > 1 else "probe/model"
pattern = sys.argv[2] if len(sys.argv) > 2 else "obj_*.png"
dest = sys.argv[3] if len(sys.argv) > 3 else os.path.join(out_dir, "contact_sheet.png")

files = sorted(glob.glob(os.path.join(out_dir, pattern)))
if not files:
    print("no images matched", pattern, "in", out_dir)
    raise SystemExit(0)

cols = 5
thumb_w, thumb_h = 260, 190
label_h = 16
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), (24, 26, 28))
draw = ImageDraw.Draw(sheet)

for i, path in enumerate(files):
    try:
        im = Image.open(path).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        print("skip", path, exc)
        continue
    im.thumbnail((thumb_w, thumb_h))
    x = (i % cols) * thumb_w + (thumb_w - im.width) // 2
    y = (i // cols) * (thumb_h + label_h) + (thumb_h - im.height) // 2
    sheet.paste(im, (x, y))
    label = os.path.basename(path).replace("obj_", "").rsplit(".", 1)[0]
    draw.text(((i % cols) * thumb_w + 4, (i // cols) * (thumb_h + label_h) + thumb_h + 2),
              label[:42], fill=(230, 230, 230))

sheet.save(dest)
print("wrote", dest, sheet.size, len(files), "tiles")
