"""Ground colour statistics for a PNG, used to compare the game against the
reference Blender renders.

Ground pixels are picked out by "green dominant" (the reference scene's ground
is a pure green ramp, and so is ours), then described by the numbers that matter
when matching a look:

  * hue / saturation / value of the *sunlit* ground (the upper percentiles of
    value, so trees' shadows on the ground do not drag the average down),
  * patch contrast — p90 / p10 of the value of sunlit ground. This is the
    amplitude of the Musgrave → ColorRamp mottling: 1.0 means a flat wash,
    2.0 means the light patches are twice as bright as the dark ones.
  * the same at the scale of the blend's ~4 m patches, measured by blurring the
    sunlit ground and taking its p90 / p10, which removes fine noise and leaves
    the broad blobs the reference is famous for.

Usage: python3 .github/ground_stats.py <png> [<png> ...]   (JSON to stdout)
"""

import colorsys
import json
import sys

import numpy as np
from PIL import Image, ImageFilter


def stats_for(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32) / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]

    # green-dominant, bright enough to be lit surface
    mx = np.maximum(np.maximum(r, g), b)
    mask = (g >= mx * 0.98) & (g > r * 1.02) & (g > b * 1.05) & (mx > 0.06)
    if mask.sum() < 500:
        return {"file": path, "ground_px": int(mask.sum()), "note": "too few ground pixels"}

    # HSV of sunlit ground (upper half of the value range)
    vals = mx[mask]
    v_thr = np.percentile(vals, 55)
    bright = mask & (mx >= v_thr)
    hsv = np.array(
        [
            colorsys.rgb_to_hsv(*px)
            for px in a[bright][:: max(1, bright.sum() // 4000)]
        ]
    )
    # hue circular stats around green (~0.333)
    hue = hsv[:, 0]
    hue_dev = (hue - 1 / 3 + 0.5) % 1.0 - 0.5
    hue_deg = 120.0 + float(np.mean(hue_dev)) * 360.0

    lum = 0.299 * r + 0.587 * g + 0.114 * b

    def contrast(m):
        x = lum[m]
        p10, p50, p90 = np.percentile(x, [10, 50, 90])
        return {
            "p10": round(float(p10), 4),
            "p50": round(float(p50), 4),
            "p90": round(float(p90), 4),
            "spread": round(float(p90 / max(p10, 1e-4)), 3),
            "cv": round(float(x.std() / max(x.mean(), 1e-4)), 3),
        }

    # broad mottling: blur away fine detail, keep the blobs
    blurred = np.asarray(im.filter(ImageFilter.GaussianBlur(9))).astype(np.float32) / 255.0
    blum = 0.299 * blurred[..., 0] + 0.587 * blurred[..., 1] + 0.114 * blurred[..., 2]

    lit = a[bright]
    return {
        "file": path,
        "ground_px": int(mask.sum()),
        "share_of_frame": round(float(mask.mean()), 3),
        "rgb_mean_lit": [round(float(v) * 255, 1) for v in lit.mean(axis=0)],
        "hsv_lit": {
            "hue_deg": round(hue_deg, 1),
            "sat": round(float(np.mean(hsv[:, 1])), 3),
            "val": round(float(np.mean(hsv[:, 2])), 3),
        },
        "contrast_fine": contrast(mask),
        "contrast_blobs": contrast(bright & (blum > 0.02)),
    }


def main():
    out = [stats_for(p) for p in sys.argv[1:]]
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
