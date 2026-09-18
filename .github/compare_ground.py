"""Compare the game's ground against the reference blend's ground.

The reference numbers come from the blend itself — the probe renders it with
Cycles (probe/view_groundtop.png, view_iso.png, view_close.png) — and the game's
come from the ground swatches the shot harness takes with every prop hidden
(probe/shots/ground-<district>-near.png / -far.png). Both sides are masked to
green-dominant, sunlit pixels by `ground_stats.py`, so they are comparable:

    hue        where the green sits between yellow (60°) and cyan (180°)
    sat        how green it is
    value      how bright it renders
    blobs      p90/p10 of the blurred lit ground = the mottling amplitude
               (1.0 = flat wash, 1.26 = the reference's soft patches)
    fine       p90/p10 of the unblurred lit ground = how much grain it carries

Swatches are paired with the reference view taken the same way: the near
swatch (straight down) against the reference's top-down view, the far swatch
(walking eye-line) against the reference's perspective views.

Usage: python3 .github/compare_ground.py [probeDir] [shotsDir]
"""

import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ground_stats import stats_for  # noqa: E402

TOPDOWN_REF = "view_groundtop.png"
PERSPECTIVE_REFS = ["view_iso.png", "view_close.png"]


def load(paths):
    rows = [stats_for(p) for p in paths if os.path.exists(p)]
    return [r for r in rows if "hsv_lit" in r]


def mean(rows, key, sub=None):
    vals = []
    for r in rows:
        v = r.get(key)
        if sub is not None:
            v = (v or {}).get(sub)
        if isinstance(v, (int, float)):
            vals.append(float(v))
    return sum(vals) / len(vals) if vals else None


def profile(rows):
    chans = [[r["rgb_mean_lit"][c] for r in rows if "rgb_mean_lit" in r] for c in range(3)]
    rnd = lambda v, n=3: None if v is None else round(v, n)  # noqa: E731
    return {
        "hue_deg": rnd(mean(rows, "hsv_lit", "hue_deg"), 1),
        "sat": rnd(mean(rows, "hsv_lit", "sat")),
        "value": rnd(mean(rows, "hsv_lit", "val")),
        "blobs": rnd(mean(rows, "contrast_blobs", "spread")),
        "fine": rnd(mean(rows, "contrast_fine", "spread")),
        "rgb_lit": [rnd(sum(c) / len(c), 1) if c else None for c in chans],
        "samples": [r["file"] for r in rows],
    }


def delta(a, ref):
    if a is None or ref is None:
        return None
    return round(a - ref, 3)


def main():
    probe = sys.argv[1] if len(sys.argv) > 1 else "probe"
    shots = sys.argv[2] if len(sys.argv) > 2 else os.path.join(probe, "shots")

    ref_top = load([os.path.join(probe, TOPDOWN_REF)])
    ref_persp = load([os.path.join(probe, f) for f in PERSPECTIVE_REFS])
    game_near = load(sorted(glob.glob(os.path.join(shots, "ground-*-near.png"))))
    game_far = load(sorted(glob.glob(os.path.join(shots, "ground-*-far.png"))))

    near_ref, near_game = profile(ref_top), profile(game_near)
    far_ref, far_game = profile(ref_persp), profile(game_far)

    report = {
        "how": {
            "reference_topdown": TOPDOWN_REF,
            "reference_perspective": PERSPECTIVE_REFS,
            "game_near": "probe/shots/ground-<district>-near.png",
            "game_far": "probe/shots/ground-<district>-far.png",
        },
        "target": {
            "hue_deg": "113-115 (just off pure green)",
            "sat": "0.69-0.72",
            "value": "0.55-0.63",
            "blobs": "~1.26-1.39 soft patches, no hard borders",
            "fine": "<= 3.5: the reference's ground carries almost no grain",
        },
        "near_sunlit": {
            "reference": near_ref,
            "game": near_game,
            "delta_game_minus_reference": {
                k: delta(near_game[k], near_ref[k]) for k in ("hue_deg", "sat", "value", "blobs", "fine")
            },
        },
        "far_sunlit": {
            "reference": far_ref,
            "game": far_game,
            "delta_game_minus_reference": {
                k: delta(far_game[k], far_ref[k]) for k in ("hue_deg", "sat", "value", "blobs", "fine")
            },
        },
    }
    text = json.dumps(report, indent=1)
    print(text)
    os.makedirs(shots, exist_ok=True)
    with open(os.path.join(shots, "ground_report.json"), "w") as fh:
        fh.write(text + "\n")
    print("wrote", os.path.join(shots, "ground_report.json"), file=sys.stderr)


if __name__ == "__main__":
    main()
