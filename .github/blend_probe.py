"""Probe v2: dump ground meshes, material recipes, statistics and renders."""

import base64
import json
import math
import os
import traceback

import bpy
from mathutils import Vector

OUT = "/tmp/blendout"
os.makedirs(OUT, exist_ok=True)
printed = {"n": 0}
BUDGET = 6_000_000


def emit(name, payload):
    print("===%s_BEGIN===" % name)
    print(payload)
    print("===%s_END===" % name)


def emit_b64(name, path, limit=1_500_000):
    try:
        data = open(path, "rb").read()
    except Exception as exc:  # noqa: BLE001
        print("MISSING %s %s" % (name, exc))
        return
    b64 = base64.b64encode(data).decode("ascii")
    if printed["n"] + len(b64) > BUDGET:
        print("SKIPPED %s" % name)
        return
    printed["n"] += len(b64)
    emit(name, b64)
    print("EMITTED %s %d bytes" % (name, len(data)))


def node_dump(mat):
    """Full parameter dump of a node tree, enough to reimplement it."""
    out = {"name": mat.name, "nodes": [], "links": []}
    if not mat.use_nodes:
        return out
    nt = mat.node_tree
    for n in nt.nodes:
        item = {"type": n.type, "name": n.name}
        if n.type in {"TEX_MUSGRAVE", "TEX_NOISE", "TEX_VORONOI"}:
            for key in ("noise_dimensions", "musgrave_type", "voronoi_dimensions", "feature"):
                if hasattr(n, key):
                    item[key] = str(getattr(n, key))
        for sock in n.inputs:
            try:
                val = sock.default_value
            except Exception:  # noqa: BLE001
                continue
            if hasattr(val, "__len__") and not isinstance(val, str):
                item[sock.name] = [round(float(v), 4) for v in val]
            elif isinstance(val, (int, float, bool)):
                item[sock.name] = round(float(val), 4) if isinstance(val, float) else val
            elif isinstance(val, str):
                item[sock.name] = val
            elif hasattr(val, "name"):
                item[sock.name] = val.name
        if n.type == "VALTORGB":
            item["stops"] = [
                {"pos": round(e.position, 4), "color": [round(c, 4) for c in e.color]}
                for e in n.color_ramp.elements
            ]
            item["interpolation"] = n.color_ramp.interpolation
        if n.type == "MAPPING":
            item["vector_type"] = n.vector_type
        if n.type == "TEX_IMAGE" and n.image:
            item["image"] = n.image.name
        out["nodes"].append(item)
    for l in nt.links:
        out["links"].append([
            "%s.%s" % (l.from_node.name, l.from_socket.name),
            "%s.%s" % (l.to_node.name, l.to_socket.name),
        ])
    return out


def mesh_to_grid(obj):
    """If the mesh is a regular X/Y grid, return (xs, ys, heights[iy][ix])."""
    mw = obj.matrix_world
    pts = [mw @ v.co for v in obj.data.vertices]
    xs = sorted({round(p.x, 4) for p in pts})
    ys = sorted({round(p.y, 4) for p in pts})
    if len(xs) * len(ys) != len(pts):
        return None
    xi = {v: i for i, v in enumerate(xs)}
    yi = {v: i for i, v in enumerate(ys)}
    grid = [[None] * len(xs) for _ in ys]
    for p in pts:
        grid[yi[round(p.y, 4)]][xi[round(p.x, 4)]] = p.z
    if any(h is None for row in grid for h in row):
        return None
    return xs, ys, grid


def emit_grid(obj, step=1):
    g = mesh_to_grid(obj)
    if not g:
        return None
    xs, ys, grid = g
    out_xs, out_ys, out_h = xs[::step], ys[::step], [row[::step] for row in grid[::step]]
    flats = [h for row in out_h for h in row]
    data = {
        "object": obj.name,
        "material": [m.name if m else None for m in obj.data.materials],
        "size": [len(out_xs), len(out_ys)],
        "span": [round(out_xs[-1] - out_xs[0], 3), round(out_ys[-1] - out_ys[0], 3)],
        "spacing": round(out_xs[1] - out_xs[0], 4),
        "min_z": round(min(flats), 3),
        "max_z": round(max(flats), 3),
        "mean_z": round(sum(flats) / len(flats), 3),
        "xs": [round(v, 3) for v in out_xs],
        "ys": [round(v, 3) for v in out_ys],
        "heights": [[round(h, 3) for h in row] for row in out_h],
    }
    emit("GRID_%s" % obj.name.upper().replace(".", "_"), json.dumps(data))
    return data


def stats(grid):
    """Roughness statistics: slope distribution, valley/ridge character."""
    hs = [h for row in grid for h in row]
    n = len(grid)
    sl = []
    for j in range(1, n - 1):
        for i in range(1, n - 1):
            dx = grid[j][i + 1] - grid[j][i - 1]
            dy = grid[j + 1][i] - grid[j - 1][i]
            sl.append(math.hypot(dx, dy) / 2.0)
    sl.sort()
    return {
        "slope_median": round(sl[len(sl) // 2], 4),
        "slope_p90": round(sl[int(len(sl) * 0.9)], 4),
        "slope_max": round(sl[-1], 4),
        "flat_fraction": round(sum(1 for s in sl if s < 0.05) / len(sl), 3),
    }


def scene_info():
    sc = bpy.context.scene
    info = {
        "collections": {c.name: [o.name for o in c.objects] for c in bpy.data.collections},
        "unit": {"scale": sc.unit_settings.scale_length, "system": sc.unit_settings.system},
        "world": None,
        "sun": None,
        "camera": None,
        "fog": {
            "type": sc.world.mist_settings.type if sc.world else None,
            "depth": sc.world.mist_settings.depth if sc.world else None,
            "start": sc.world.mist_settings.start if sc.world else None,
        },
    }
    w = sc.world
    if w and w.use_nodes:
        bg = w.node_tree.nodes.get("Background")
        if bg:
            info["world"] = {
                "color": [round(c, 4) for c in bg.inputs[0].default_value],
                "strength": round(float(bg.inputs[1].default_value), 3),
            }
    for o in bpy.data.objects:
        if o.type == "LIGHT":
            info["sun"] = {
                "name": o.name, "kind": o.data.type, "energy": o.data.energy,
                "color": [round(c, 3) for c in o.data.color],
                "rotation": [round(math.degrees(a), 2) for a in o.rotation_euler],
                "angle": round(math.radians(o.data.angle) if hasattr(o.data, "angle") else 0, 4),
            }
        if o.type == "CAMERA":
            info["camera"] = {
                "name": o.name, "lens": o.data.lens, "type": o.data.type,
                "loc": [round(v, 3) for v in o.location],
                "rotation": [round(math.degrees(a), 2) for a in o.rotation_euler],
            }
    emit("SCENE", json.dumps(info, indent=1))


def render_views():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 4
    sc.render.resolution_x = 720
    sc.render.resolution_y = 460
    sc.render.image_settings.file_format = "PNG"
    if not any(o.type == "LIGHT" for o in bpy.data.objects):
        sun = bpy.data.objects.new("probe_sun", bpy.data.lights.new("probe_sun", "SUN"))
        sun.data.energy = 4.0
        sun.rotation_euler = (math.radians(52), 0, math.radians(35))
        sc.collection.objects.link(sun)
    if sc.world is None:
        sc.world = bpy.data.worlds.new("probe_world")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.62, 0.78, 0.92, 1.0)

    cam_data = bpy.data.cameras.new("probe_cam")
    cam = bpy.data.objects.new("probe_cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam

    # Frame the ground meshes.
    pts = []
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name.startswith("ground"):
            pts += [o.matrix_world @ v.co for v in o.data.vertices]
    if not pts:
        pts = [Vector((0, 0, 0)), Vector((1, 1, 1))]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    zs = [p.z for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    top = max(zs)
    target = Vector((cx, cy, (min(zs) + top) / 2))

    views = [
        ("TOP", "ORTHO", (cx, cy, top + span), (0, 0, 0), span * 1.15),
        ("ISO", "PERSP", (cx - span * 0.8, cy - span * 0.8, top + span * 0.5), None, 0),
        ("LOW", "PERSP", (cx + span * 0.7, cy - span * 0.55, top + span * 0.06), None, 0),
        ("HERO", "PERSP", (cx - span * 0.25, cy - span * 0.95, top + span * 0.22), None, 0),
    ]
    for name, kind, loc, rot, ortho in views:
        cam_data.type = kind
        cam_data.lens = 42
        if kind == "ORTHO":
            cam_data.ortho_scale = ortho
            cam.rotation_euler = rot
        else:
            d = target - Vector(loc)
            cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        cam.location = loc
        path = os.path.join(OUT, "view_%s.png" % name.lower())
        sc.render.filepath = path
        try:
            bpy.ops.render.render(write_still=True)
            emit_b64("VIEW_" + name, path)
        except Exception as exc:  # noqa: BLE001
            print("RENDER_FAIL %s %s" % (name, exc))
            traceback.print_exc()


def main():
    try:
        scene_info()
    except Exception:  # noqa: BLE001
        traceback.print_exc()

    wanted = sorted(
        o.name for o in bpy.data.objects
        if o.type == "MESH" and (o.name.startswith("ground") or "terrain" in o.name.lower())
    )
    print("GROUND_OBJECTS %s" % wanted)

    mats = set()
    for name in wanted:
        obj = bpy.data.objects[name]
        for m in obj.data.materials:
            if m:
                mats.add(m.name)
    for name in wanted:
        obj = bpy.data.objects[name]
        try:
            step = max(1, int(round(len(obj.data.vertices) ** 0.5 / 130)))
            g = emit_grid(obj, step)
            if g:
                print("STATS %s %s" % (name, json.dumps(stats(g["heights"]))))
        except Exception:  # noqa: BLE001
            traceback.print_exc()

    for name in sorted(mats):
        try:
            emit("MAT_%s" % name.upper().replace(".", "_"),
                 json.dumps(node_dump(bpy.data.materials[name]), indent=1))
        except Exception:  # noqa: BLE001
            traceback.print_exc()

    try:
        render_views()
    except Exception:  # noqa: BLE001
        traceback.print_exc()
    print("PROBE_DONE")


main()
