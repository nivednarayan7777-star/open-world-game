"""Probe a .blend file: report scene contents, sample the ground heightmap,
bake a material map, render preview images and emit everything as base64/JSON
on stdout so it can be read back from a GitHub Actions log."""

import base64
import json
import math
import os
import traceback

import bpy
from mathutils import Vector

OUT = "/tmp/blend"
os.makedirs(OUT, exist_ok=True)

BUDGET = 7_000_000  # characters of base64 we are willing to print
printed = {"n": 0}


def emit_marker(name, payload):
    print("===%s_BEGIN===" % name)
    print(payload)
    print("===%s_END===" % name)


def emit_b64(name, path, limit=2_500_000):
    try:
        with open(path, "rb") as fh:
            data = fh.read()
    except Exception as exc:  # noqa: BLE001
        print("MISSING %s %s" % (name, exc))
        return
    b64 = base64.b64encode(data).decode("ascii")
    if printed["n"] + len(b64) > BUDGET:
        print("SKIPPED %s (%d bytes, budget)" % (name, len(data)))
        return
    printed["n"] += len(b64)
    emit_marker(name, b64)
    print("EMITTED %s %d bytes raw / %d base64" % (name, len(data), len(b64)))


def world_verts(obj):
    mw = obj.matrix_world
    return [mw @ v.co for v in obj.data.vertices]


def report():
    scene = bpy.context.scene
    data = {
        "blender": bpy.app.version_string,
        "scene": scene.name,
        "unit_scale": scene.unit_settings.scale_length,
        "render_engine": scene.render.engine,
        "collections": [c.name for c in bpy.data.collections],
        "objects": [],
        "materials": [],
        "images": [],
    }

    for obj in bpy.data.objects:
        info = {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "loc": [round(v, 4) for v in obj.location],
            "scale": [round(v, 4) for v in obj.scale],
        }
        if obj.type == "MESH":
            me = obj.data
            vs = world_verts(obj)
            if vs:
                xs = [v.x for v in vs]
                ys = [v.y for v in vs]
                zs = [v.z for v in vs]
                info["bbox_min"] = [round(min(xs), 3), round(min(ys), 3), round(min(zs), 3)]
                info["bbox_max"] = [round(max(xs), 3), round(max(ys), 3), round(max(zs), 3)]
            info["verts"] = len(me.vertices)
            info["polys"] = len(me.polygons)
            info["materials"] = [m.name if m else None for m in me.materials]
            info["uv_layers"] = [l.name for l in me.uv_layers]
            info["color_attrs"] = [a.name for a in getattr(me, "color_attributes", [])]
            info["modifiers"] = [m.type for m in obj.modifiers]
            info["shade_smooth"] = bool(me.polygons) and me.polygons[0].use_smooth
        data["objects"].append(info)

    for mat in bpy.data.materials:
        m = {"name": mat.name, "use_nodes": mat.use_nodes, "blend": mat.blend_method}
        try:
            if mat.use_nodes:
                bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if bsdf:
                    m["base_color"] = [round(c, 3) for c in bsdf.inputs["Base Color"].default_value]
                    m["roughness"] = round(float(bsdf.inputs["Roughness"].default_value), 3)
                    for key in ("Metallic", "Alpha", "Transmission Weight", "Transmission"):
                        if key in bsdf.inputs:
                            m["_".join(key.lower().split())] = round(float(bsdf.inputs[key].default_value), 3)
                            break
                    tex = []
                    for node in mat.node_tree.nodes:
                        if node.type == "TEX_IMAGE" and node.image:
                            tex.append(node.image.name)
                    m["textures"] = tex
                    m["nodes"] = sorted({n.type for n in mat.node_tree.nodes})
        except Exception as exc:  # noqa: BLE001
            m["error"] = str(exc)
        data["materials"].append(m)

    for img in bpy.data.images:
        data["images"].append({
            "name": img.name,
            "size": [img.size[0], img.size[1]],
            "packed": bool(img.packed_file),
            "file": img.filepath,
            "source": img.source,
        })

    emit_marker("REPORT", json.dumps(data, indent=1))


def pick_ground():
    best = None
    best_score = -1
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.data.polygons:
            continue
        vs = world_verts(obj)
        if len(vs) < 4:
            continue
        xs = [v.x for v in vs]
        ys = [v.y for v in vs]
        area = (max(xs) - min(xs)) * (max(ys) - min(ys))
        score = area * math.log(len(vs) + 2)
        # prefer big, dense, flat-ish meshes = terrain
        if score > best_score:
            best_score = score
            best = obj
    return best


def sample_grid(obj, n=129):
    from mathutils.bvhtree import BVHTree

    vs = world_verts(obj)
    polys = [tuple(p.vertices) for p in obj.data.polygons]
    mat_of_poly = [p.material_index for p in obj.data.polygons]
    bvh = BVHTree.FromPolygons(vs, polys, all_triangles=False)

    xs = [v.x for v in vs]
    ys = [v.y for v in vs]
    zs = [v.z for v in vs]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    top = max(zs) + 5.0

    heights = []
    mats = []
    for j in range(n):
        row_h = []
        row_m = []
        ty = miny + (maxy - miny) * j / (n - 1)
        for i in range(n):
            tx = minx + (maxx - minx) * i / (n - 1)
            hit = bvh.ray_cast(Vector((tx, ty, top)), Vector((0, 0, -1)), 10000.0)
            if hit[0] is None:
                row_h.append(None)
                row_m.append(-1)
            else:
                row_h.append(round(hit[0].z, 3))
                pi = hit[3]
                row_m.append(mat_of_poly[pi] if pi is not None and pi < len(mat_of_poly) else -1)
        heights.append(row_h)
        mats.append(row_m)

    minh = min(h for row in heights for h in row if h is not None)
    maxh = max(h for row in heights for h in row if h is not None)
    grid = {
        "object": obj.name,
        "n": n,
        "bounds": [round(minx, 3), round(miny, 3), round(maxx, 3), round(maxy, 3)],
        "min_z": round(minh, 3),
        "max_z": round(maxh, 3),
        "materials": [m.name if m else None for m in obj.data.materials],
        "heights": heights,
        "material_index": mats,
    }
    emit_marker("GRID", json.dumps(grid))
    return grid


def setup_light_and_world(grid):
    scene = bpy.context.scene
    if not any(o.type == "LIGHT" for o in bpy.data.objects):
        sun = bpy.data.objects.new("probe_sun", bpy.data.lights.new("probe_sun", "SUN"))
        sun.data.energy = 4.0
        sun.rotation_euler = (math.radians(52), 0, math.radians(35))
        scene.collection.objects.link(sun)
    world = scene.world or bpy.data.worlds.new("probe_world")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.62, 0.78, 0.92, 1.0)
        bg.inputs[1].default_value = 1.0


def render_views(grid):
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 24
        scene.cycles.use_denoising = True
    except Exception:  # noqa: BLE001
        scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 400
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    minx, miny, maxx, maxy = grid["bounds"]
    cx, cy = (minx + maxx) / 2.0, (miny + maxy) / 2.0
    span = max(maxx - minx, maxy - miny)

    cam_data = bpy.data.cameras.new("probe_cam")
    cam = bpy.data.objects.new("probe_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    views = [
        ("TOP", "ORTHO", (cx, cy, max(grid["max_z"] + span, 10)), (0, 0, 0), span * 1.05),
        ("ISO", "PERSP", (cx - span * 0.75, cy - span * 0.75, grid["max_z"] + span * 0.55), None, 0),
        ("LOW", "PERSP", (cx + span * 0.62, cy - span * 0.62, grid["min_z"] + span * 0.10), None, 0),
    ]
    target = Vector((cx, cy, (grid["min_z"] + grid["max_z"]) / 2.0))
    for name, kind, loc, rot, ortho in views:
        cam_data.type = kind
        if kind == "ORTHO":
            cam_data.ortho_scale = ortho
            cam.rotation_euler = rot
        else:
            direction = target - Vector(loc)
            cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        cam.location = loc
        path = os.path.join(OUT, "view_%s.png" % name.lower())
        scene.render.filepath = path
        try:
            bpy.ops.render.render(write_still=True)
            emit_b64("VIEW_" + name, path, limit=1_200_000)
        except Exception as exc:  # noqa: BLE001
            print("RENDER_FAIL %s %s" % (name, exc))
            traceback.print_exc()


def main():
    report()
    grid = None
    try:
        ground = pick_ground()
        print("GROUND_PICK %s" % (ground.name if ground else None))
        if ground:
            grid = sample_grid(ground, n=129)
    except Exception:  # noqa: BLE001
        traceback.print_exc()
    try:
        setup_light_and_world(grid or {"bounds": [0, 0, 1, 1], "min_z": 0, "max_z": 1})
        if grid:
            render_views(grid)
    except Exception:  # noqa: BLE001
        traceback.print_exc()
    print("PROBE_DONE")


main()
