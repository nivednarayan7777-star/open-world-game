"""kit_probe.py — the focused look at the low-poly hill/lake kit.

Renders the kit the way it would sit in the game: the Landscape slab with its
lake and rocks, the three conifers standing on the hill, and close-ups of the
hill, a rock and a tree. Also dumps the Landscape's facet statistics (are its
triangles flat-shaded? how big is one facet?) and a clean height field.

Run: blender -b source.glb --python .github/kit_probe.py
"""
import json
import math
import os
import traceback

import bpy
import numpy as np
from mathutils import Vector

OUT = os.environ.get("MODEL_OUT") or "/tmp/kitout"
os.makedirs(OUT, exist_ok=True)
LOG = []


def log(*p):
    line = " ".join(str(x) for x in p)
    LOG.append(line)
    print(line)


def write(name, text):
    with open(os.path.join(OUT, name), "w") as fh:
        fh.write(text)
    log("wrote", name)


def import_source():
    path_file = os.path.join(os.environ.get("WORK", "/tmp/model"), "path.txt")
    src = None
    if os.path.exists(path_file):
        src = open(path_file).read().strip()
    if src and src.lower().endswith(".blend"):
        return src
    if src:
        log("importing", src)
        bpy.ops.import_scene.gltf(filepath=src)
    return src


def obj(name):
    return bpy.data.objects.get(name)


def height_of(name, x, y):
    """Top surface height of a mesh at (x, y), by ray cast straight down."""
    o = obj(name)
    if not o:
        return 0.0
    mw = o.matrix_world
    inv = mw.inverted()
    origin = inv @ Vector((x, y, 50.0))
    direction = (inv.to_3x3() @ Vector((0, 0, -1))).normalized()
    hit, loc, _, _ = o.ray_cast(origin, direction)
    if not hit:
        return None
    world = mw @ loc
    return world.z


def setup():
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            sc.render.engine = eng
            break
        except Exception:  # noqa: BLE001
            continue
    log("engine", sc.render.engine)
    if sc.render.engine == "CYCLES":
        sc.cycles.device = "CPU"
        sc.cycles.samples = 24
        sc.cycles.use_denoising = False
    elif hasattr(sc.eevee, "taa_render_samples"):
        sc.eevee.taa_render_samples = 24
    sc.render.image_settings.file_format = "PNG"
    sc.render.resolution_x, sc.render.resolution_y = 720, 480
    # Neutral daylight so the shapes read clearly (the kit ships grey).
    if sc.world is None:
        sc.world = bpy.data.worlds.new("kit_world")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.55, 0.72, 0.88, 1.0)
        bg.inputs[1].default_value = 1.1
    if not any(o.type == "LIGHT" and o.name.startswith("kit") for o in bpy.data.objects):
        data = bpy.data.lights.new("kit_sun", "SUN")
        data.energy = 4.5
        data.angle = math.radians(5)
        sun = bpy.data.objects.new("kit_sun", data)
        sun.rotation_euler = (math.radians(48), 0, math.radians(40))
        sc.collection.objects.link(sun)

    cam_data = bpy.data.cameras.new("kit_cam")
    cam = bpy.data.objects.new("kit_cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def look_at(cam, loc, target):
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


def render(path):
    bpy.context.scene.render.filepath = path
    try:
        bpy.ops.render.render(write_still=True)
        if os.path.exists(path) and os.path.getsize(path) > 1000:
            log("rendered", os.path.basename(path))
            return True
    except Exception:  # noqa: BLE001
        traceback.print_exc()
    return False


def facet_report(name):
    """How the mesh is shaded: per-face normals vs averaged, and facet size."""
    o = obj(name)
    if not o:
        return
    me = o.data
    me.calc_loop_triangles()
    smooth = sum(1 for p in me.polygons if p.use_smooth)
    log("FACETS %s: %d polys, %d smooth-shaded" % (name, len(me.polygons), smooth))
    areas = [p.area for p in me.polygons if p.area > 0]
    if areas:
        areas = np.array(areas)
        log("FACETS %s: face area median %.5f (edge ~%.4f), max %.5f" % (
            name, float(np.median(areas)), float(math.sqrt(np.median(areas))), float(areas.max())))
    ngon = {}
    for p in me.polygons:
        ngon[p.loop_total] = ngon.get(p.loop_total, 0) + 1
    log("FACETS %s: ngons %s" % (name, sorted(ngon.items())))


def main():
    import_source()
    cam = setup()

    sc = bpy.context.scene
    # the stray cube/camera/light that ship with the kit only get in the way
    for o in bpy.data.objects:
        if o.name in ("Cube", "Camera", "Light") or o.type in ("CAMERA", "LIGHT"):
            if not o.name.startswith("kit"):
                o.hide_render = True

    facet_report("Landscape")
    facet_report("rock_01")
    facet_report("tree.001")

    # ---- the island as the artist laid it out (rocks, lake, nothing else)
    rock_like = [o for o in bpy.data.objects if o.name.startswith("rock_")]
    trees = [o for o in bpy.data.objects if o.name.startswith("tree")]
    for o in trees:
        o.hide_render = True
    views = [
        ("island_iso", (2.6, -3.4, 2.3), (0.0, 0.0, 0.1)),
        ("island_low", (2.2, -3.0, 0.45), (0.0, 0.0, 0.1)),
        ("island_top", (0.0, 0.0, 4.2), (0.0, 0.0, 0.0)),
        ("hill_close", (0.55, -0.95, 0.62), (0.05, -0.15, 0.22)),
        ("lake_close", (1.35, -0.45, 0.5), (0.35, -0.25, -0.02)),
    ]
    for name, loc, tgt in views:
        cam.data.type = "PERSP"
        cam.data.lens = 48
        if name == "island_top":
            cam.data.type = "ORTHO"
            cam.data.ortho_scale = 3.1
            cam.location = Vector(loc)
            cam.rotation_euler = (0.0, 0.0, 0.0)
        else:
            look_at(cam, loc, tgt)
        render(os.path.join(OUT, "%s.png" % name))

    # ---- the conifers, planted on the hill by ray casting the terrain
    for o in trees:
        o.hide_render = False
    spots = [(-0.30, 0.05), (0.15, 0.35), (0.05, 0.62)]
    for o, (x, y) in zip(sorted(trees, key=lambda t: t.name), spots):
        h = height_of("Landscape", x, y)
        if h is None:
            continue
        o.location = (x, y, h - 0.02)
        o.scale = (0.42, 0.42, 0.42)
        log("planted", o.name, "at", round(x, 2), round(y, 2), "height", round(h, 3))
    for name, loc, tgt in [
        ("island_trees", (2.4, -3.2, 1.9), (0.0, 0.0, 0.35)),
        ("tree_close", (0.9, -0.6, 0.95), (0.15, 0.35, 0.55)),
    ]:
        cam.data.type = "PERSP"
        cam.data.lens = 50
        look_at(cam, loc, tgt)
        render(os.path.join(OUT, "%s.png" % name))

    # ---- a clean height field of the slab, in the file's own units
    o = obj("Landscape")
    if o:
        mw = np.array(o.matrix_world)
        v = np.array([p.co[:] for p in o.data.vertices])
        w = (mw @ np.hstack([v, np.ones((len(v), 1))]).T).T[:, :3]
        log("SLAB world bbox min %s max %s" % (np.round(w.min(0), 3), np.round(w.max(0), 3)))
        me = o.data
        me.calc_loop_triangles()
        smooth = sum(1 for p in me.polygons if p.use_smooth)
        log("SLAB %d tris, %d smooth (%.0f%%), height %.3f" % (
            len(me.loop_triangles), smooth, 100.0 * smooth / max(1, len(me.polygons)),
            w[:, 2].max() - w[:, 2].min()))

    write("kit.log", "\n".join(LOG) + "\n")
    print("KIT_PROBE_DONE")


try:
    main()
except Exception:  # noqa: BLE001
    traceback.print_exc()
    write("kit.log", "\n".join(LOG) + "\n" + traceback.format_exc())
    print("KIT_PROBE_FAILED")
