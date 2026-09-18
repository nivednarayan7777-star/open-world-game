"""model_probe.py — read a downloaded model file and dump everything needed to
port it into the game, then render it so the port can be judged by eye.

Run as:  blender -b <file.blend> --python .github/model_probe.py
     or:  blender -b --python .github/model_probe.py        (imports the file)

Outputs, into $MODEL_OUT (default /tmp/modelout):
    scene.json          render settings, colour management, world, lights, cameras
    objects.json        every object: transform, size, mesh stats, modifiers,
                        materials, particle systems, curve/armature detail
    materials.json      full node graphs (parameters + links + ramp stops)
    groups.json         objects de-duplicated into "models" by signature
    summary.txt         one-line-per-model human summary (read this first)
    geometry.json.gz    compact vertex/index dump for small meshes
    tex_<image>.png     material images, scaled down, so they can be re-made
    view_*.png          scene renders (top/iso/low/hero/close + the scene camera)
    obj_<name>.png      one render per de-duplicated model
"""

import gzip
import json
import math
import os
import struct
import sys
import traceback

import bpy
import numpy as np
from mathutils import Vector

OUT = os.environ.get("MODEL_OUT") or "/tmp/modelout"
os.makedirs(OUT, exist_ok=True)

WORK = os.environ.get("WORK") or "/tmp/model"
MAX_GEOM_TRIS = 12000          # skip meshes heavier than this in the mesh dump
MAX_GEOM_OBJECTS = 80          # and cap how many meshes get dumped at all
MAX_OBJ_RENDERS = 40           # per-model renders
FAST_TEX = int(os.environ.get("FAST_TEX", "256"))

LOG = []


def log(*parts):
    line = " ".join(str(p) for p in parts)
    LOG.append(line)
    print(line)


# --------------------------------------------------------------- scene access --

def load_source():
    """A .blend is already open (blender -b file.blend). For anything else,
    import it into the empty scene."""
    path_file = os.path.join(WORK, "path.txt")
    src = None
    if os.path.exists(path_file):
        with open(path_file) as fh:
            src = fh.read().strip()
    if not src or not os.path.exists(src):
        src = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else None

    if src and src.lower().endswith(".blend"):
        log("SOURCE blend (opened directly):", src)
        log("blender:", bpy.app.version_string)
        return src

    if not src:
        log("no source path found; probing whatever is open")
        return None

    ext = os.path.splitext(src)[1].lower()
    log("SOURCE import:", src, ext)
    try:
        if ext in (".obj",):
            bpy.ops.import_scene.obj(filepath=src)
        elif ext in (".fbx",):
            bpy.ops.import_scene.fbx(filepath=src)
        elif ext in (".glb", ".gltf"):
            bpy.ops.import_scene.gltf(filepath=src)
        elif ext in (".dae",):
            bpy.ops.wm.collada_import(filepath=src)
        elif ext in (".stl",):
            bpy.ops.import_mesh.stl(filepath=src)
        elif ext in (".ply",):
            bpy.ops.import_mesh.ply(filepath=src)
        elif ext in (".usd", ".usdc", ".usda"):
            bpy.ops.wm.usd_import(filepath=src)
        elif ext in (".abc",):
            bpy.ops.wm.alembic_import(filepath=src)
        else:
            log("unknown extension, trying gltf then obj")
            try:
                bpy.ops.import_scene.gltf(filepath=src)
            except Exception:  # noqa: BLE001
                bpy.ops.import_scene.obj(filepath=src)
    except Exception as exc:  # noqa: BLE001
        log("IMPORT_FAILED", ext, exc)
        traceback.print_exc()
    return src


def write(name, text):
    path = os.path.join(OUT, name)
    with open(path, "w") as fh:
        fh.write(text)
    log("wrote", path, len(text))


def emit_json(name, obj, indent=None):
    write(name, json.dumps(obj, indent=indent, default=str))


def rnd(v, n=4):
    try:
        return round(float(v), n)
    except Exception:  # noqa: BLE001
        return v


def vec(v, n=4):
    try:
        return [round(float(c), n) for c in v]
    except Exception:  # noqa: BLE001
        return None


def color(v, n=4):
    return vec(v, n) if v is not None else None


# -------------------------------------------------------------- node dumping --

def socket_value(sock):
    try:
        val = sock.default_value
    except Exception:  # noqa: BLE001
        return None
    try:
        if hasattr(val, "__len__") and not isinstance(val, str):
            return [rnd(v) for v in val]
        if isinstance(val, bool):
            return val
        if isinstance(val, float):
            return rnd(val)
        if isinstance(val, int):
            return val
        if isinstance(val, str):
            return val
        if hasattr(val, "name"):
            return val.name
    except Exception:  # noqa: BLE001
        return None
    return None


def node_dump(mat):
    out = {"name": mat.name, "blend_method": None, "nodes": [], "links": []}
    for attr in ("blend_method", "shadow_method"):
        if hasattr(mat, attr):
            out[attr] = str(getattr(mat, attr))
    if not mat.use_nodes:
        out["use_nodes"] = False
        out["diffuse_color"] = color(mat.diffuse_color)
        return out
    nt = mat.node_tree
    for n in nt.nodes:
        item = {"type": n.type, "name": n.name, "label": n.label}
        for key in ("noise_dimensions", "musgrave_type", "voronoi_dimensions",
                    "feature", "operation", "blend_type", "interpolation",
                    "distribution", "space", "extension", "projection",
                    "vector_type", "mapping_type", "wave_type", "bands_direction",
                    "clamp_type", "falloff_type", "math_type", "axis", "fit_type"):
            if hasattr(n, key):
                item[key] = str(getattr(n, key))
        if n.type == "TEX_MUSGRAVE" and hasattr(n, "musgrave_dimensions"):
            item["musgrave_dimensions"] = str(n.musgrave_dimensions)
        inputs = {}
        for sock in n.inputs:
            v = socket_value(sock)
            if v is not None:
                inputs[sock.name] = v
        item["inputs"] = inputs
        if n.type == "VALTORGB":
            item["stops"] = [
                {"pos": rnd(e.position), "color": [rnd(c) for c in e.color]}
                for e in n.color_ramp.elements
            ]
            item["ramp_interpolation"] = str(n.color_ramp.interpolation)
            item["color_mode"] = str(n.color_ramp.color_mode)
            item["hue_interpolation"] = str(n.color_ramp.hue_interpolation)
        if n.type == "TEX_IMAGE" and n.image:
            item["image"] = n.image.name
            item["image_size"] = [int(n.image.size[0]), int(n.image.size[1])]
            item["image_source"] = str(n.image.source)
            item["image_filepath"] = n.image.filepath
            item["image_packed"] = bool(n.image.packed_file)
            item["image_colorspace"] = str(n.image.colorspace_settings.name) \
                if n.image.colorspace_settings else None
        if n.type == "TEX_IMAGE" and hasattr(n, "interpolation"):
            item["image_interpolation"] = str(n.interpolation)
        if n.type == "TEX_COORD" and hasattr(n, "object"):
            item["object"] = n.object.name if n.object else None
        if n.type == "ATTRIBUTE":
            item["attribute_name"] = getattr(n, "attribute_name", None)
        if n.type == "GROUP" and hasattr(n, "node_tree") and n.node_tree:
            item["node_group"] = n.node_tree.name
        if n.type == "BUMP" and n.inputs.get("Strength"):
            pass
        if n.type in ("BSDF_PRINCIPLED", "EMISSION", "BSDF_DIFFUSE", "BSDF_GLOSSY",
                      "BSDF_TRANSPARENT", "BSDF_SPECULAR", "MIX_SHADER", "ADD_SHADER"):
            pass
        out["nodes"].append(item)
    for l in nt.links:
        out["links"].append([
            "%s.%s" % (l.from_node.name, l.from_socket.name),
            "%s.%s" % (l.to_node.name, l.to_socket.name),
        ])
    return out


# ----------------------------------------------------------- shape description --

def mesh_to_grid(obj, mesh):
    """If a mesh only varies in one axis, return (xs, ys, heights) — the shape
    a ground slab needs to be re-made exactly."""
    mw = obj.matrix_world
    pts = [mw @ v.co for v in mesh.vertices]
    if not pts:
        return None
    if max(p.z for p in pts) - min(p.z for p in pts) > 1e-4:
        return None
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


def emit_grid(name, g, step=1):
    xs, ys, grid = g
    ox, oy, oh = xs[::step], ys[::step], [row[::step] for row in grid[::step]]
    flats = [h for row in oh for h in row]
    data = {
        "object": name,
        "size": [len(ox), len(oy)],
        "span": [rnd(ox[-1] - ox[0], 3), rnd(oy[-1] - oy[0], 3)],
        "spacing": rnd(ox[1] - ox[0] if len(ox) > 1 else 0, 4),
        "min_z": rnd(min(flats), 3),
        "max_z": rnd(max(flats), 3),
        "mean_z": rnd(sum(flats) / len(flats), 3),
        "heights": [[rnd(h, 3) for h in row] for row in oh],
    }
    emit_json("grid_%s.json" % name.lower().replace(".", "_"), data)
    return data


def geometry_stats(mesh):
    verts = np.array([v.co[:] for v in mesh.vertices], dtype=np.float64) \
        if len(mesh.vertices) else np.zeros((0, 3))
    mesh.calc_loop_triangles()
    tris = len(mesh.loop_triangles)
    stats = {"verts": len(mesh.vertices), "edges": len(mesh.edges), "tris": tris,
             "polys": len(mesh.polygons)}
    if len(verts):
        stats["bbox_min"] = vec(verts.min(axis=0))
        stats["bbox_max"] = vec(verts.max(axis=0))
        stats["dims"] = vec(verts.max(axis=0) - verts.min(axis=0))
        stats["centroid"] = vec(verts.mean(axis=0))
    stats["loose_verts"] = sum(1 for v in mesh.vertices if not any(
        v.index in e.vertices for e in mesh.edges[:0])) if False else 0
    ngons = [p.loop_total for p in mesh.polygons]
    if ngons:
        stats["ngon_histogram"] = {str(k): ngons.count(k) for k in sorted(set(ngons))}
        stats["smooth_fraction"] = rnd(
            sum(1 for p in mesh.polygons if p.use_smooth) / len(mesh.polygons), 3)
    if mesh.uv_layers:
        stats["uv_layers"] = [uv.name for uv in mesh.uv_layers]
    if getattr(mesh, "color_attributes", None):
        cols = []
        for ca in mesh.color_attributes:
            ent = {"name": ca.name, "domain": str(ca.domain), "type": str(ca.data_type)}
            try:
                arr = np.array([d.color[:] for d in ca.data], dtype=np.float64)
                if len(arr):
                    ent["mean_rgba"] = vec(arr.mean(axis=0))
            except Exception:  # noqa: BLE001
                pass
            cols.append(ent)
        stats["color_attributes"] = cols
    if getattr(mesh, "materials", None):
        stats["material_slots"] = [m.name if m else None for m in mesh.materials]
    return stats


def modifier_dump(obj):
    out = []
    for m in obj.modifiers:
        item = {"name": m.name, "type": m.type}
        for key in ("levels", "render_levels", "count", "thickness", "strength",
                    "mid_level", "ratio", "width", "segments", "angle", "factor",
                    "iterations", "offset", "use_relative_offset", "relative_offset",
                    "use_constant_offset", "constant_offset_displace", "size",
                    "voxel_size", "octree_depth", "decimate_type", "mode",
                    "solidify_mode", "use_rim", "subdivision_type", "uv_smooth",
                    "merge_threshold", "use_clamp", "texture", "object", "direction",
                    "deform_axis", "limit_method", "vertex_group", "invert_vertex_group",
                    "use_x", "use_y", "use_z", "use_apply_on_spline", "spline_type"):
            if hasattr(m, key):
                v = getattr(m, key)
                if hasattr(v, "name"):
                    v = v.name
                if isinstance(v, (int, float, bool, str)) or v is None:
                    item[key] = v
        if hasattr(m, "texture_coords"):
            item["texture_coords"] = str(m.texture_coords)
        out.append(item)
    return out


def particle_dump(obj):
    out = []
    for ps in obj.particle_systems:
        s = ps.settings
        item = {"name": ps.name, "type": str(s.type), "count": s.count,
                "frame_start": rnd(s.frame_start), "frame_end": rnd(s.frame_end),
                "lifetime": rnd(s.lifetime), "particle_size": rnd(s.particle_size),
                "size_random": rnd(s.size_random), "render_type": str(s.render_type),
                "emit_from": str(s.emit_from), "distribution": str(s.distribution),
                "seed": getattr(s, "seed", None), "hair_length": rnd(getattr(s, "hair_length", 0)),
                "factor_random": rnd(s.factor_random),
                "rotation_factor_random": rnd(getattr(s, "rotation_factor_random", 0)),
                "use_rotation_instance": bool(getattr(s, "use_rotation_instance", False)),
                "use_scale_instance": bool(getattr(s, "use_scale_instance", False)),
                "use_advanced_hair": bool(getattr(s, "use_advanced_hair", False)),
                "use_modifier_stack": bool(getattr(s, "use_modifier_stack", False)),
                "object": s.instance_object.name if s.instance_object else None,
                "collection": s.instance_collection.name if getattr(s, "instance_collection", None) else None,
                "effector_weights": None}
        try:
            item["evaluated_particles"] = len(ps.particles)
        except Exception:  # noqa: BLE001
            pass
        out.append(item)
    return out


def object_dump(obj, depsgraph):
    info = {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "location": vec(obj.location),
        "rotation_euler_deg": vec([math.degrees(a) for a in obj.rotation_euler]),
        "rotation_quaternion": vec(obj.rotation_quaternion) if obj.rotation_mode == "QUATERNION" else None,
        "scale": vec(obj.scale),
        "dims": vec(obj.dimensions),
        "matrix_world": [rnd(v) for row in obj.matrix_world for v in row],
        "collections": [c.name for c in obj.users_collection],
        "hide_render": bool(obj.hide_render),
        "hide_viewport": bool(obj.hide_viewport),
        "visible_in_render": bool(obj.visible_get() if hasattr(obj, "visible_get") else True),
        "materials": [m.name if m else None for m in obj.data.materials]
        if hasattr(obj.data, "materials") else [],
        "modifiers": modifier_dump(obj),
    }
    if obj.type == "MESH":
        mw = obj.matrix_world
        scale = [mw.col[i].xyz.length for i in range(3)]
        info["world_dims"] = vec([
            obj.dimensions.x * (scale[0] if scale[0] else 1),
            obj.dimensions.y * (scale[1] if scale[1] else 1),
            obj.dimensions.z * (scale[2] if scale[2] else 1),
        ])
        try:
            info["mesh"] = geometry_stats(obj.data)
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        try:
            ev = obj.evaluated_get(depsgraph)
            me = ev.to_mesh()
            info["evaluated"] = {"verts": len(me.vertices),
                                 "tris": (me.calc_loop_triangles(), len(me.loop_triangles))[1]}
            g = mesh_to_grid(obj, me)
            if g and not info.get("grid"):
                info["grid_candidate"] = True
            ev.to_mesh_clear()
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        info["vertex_groups"] = [g.name for g in obj.vertex_groups]
        info["shape_keys"] = [k.name for k in obj.data.shape_keys.key_blocks] \
            if obj.data.shape_keys else []
        info["particles"] = particle_dump(obj)
    elif obj.type == "CURVE":
        c = obj.data
        info["curve"] = {
            "dimensions": str(c.dimensions),
            "resolution_u": c.resolution_u,
            "render_resolution_u": getattr(c.render_resolution_u, "real", None)
            if hasattr(c, "render_resolution_u") else None,
            "bevel_depth": rnd(c.bevel_depth),
            "bevel_resolution": c.bevel_resolution,
            "extrude": rnd(c.extrude),
            "splines": [{"type": str(s.type), "points": len(s.points),
                         "bevel_depth": rnd(getattr(s, "bevel_depth", 0))} for s in c.splines],
            "fill_mode": str(c.fill_mode),
            "material_slots": [m.name if m else None for m in c.materials],
        }
    elif obj.type == "LIGHT":
        d = obj.data
        info["light"] = {"kind": str(d.type), "energy": rnd(d.energy),
                         "color": vec(d.color), "radius": rnd(getattr(d, "radius", 0)),
                         "angle": rnd(getattr(d, "angle", 0)),
                         "size": rnd(getattr(d, "size", 0))}
    elif obj.type == "CAMERA":
        d = obj.data
        info["camera"] = {"type": str(d.type), "lens": rnd(d.lens),
                          "sensor_width": rnd(d.sensor_width),
                          "ortho_scale": rnd(d.ortho_scale),
                          "shift_x": rnd(d.shift_x), "shift_y": rnd(d.shift_y)}
    elif obj.type == "EMPTY":
        info["empty_type"] = str(obj.empty_display_type)
        info["empty_size"] = rnd(obj.empty_display_size)
    return info


def signature(info):
    """Group identical models: same mesh size + dims + material."""
    m = info.get("mesh", {})
    return "%s|%s|%s|%s|%s" % (
        info.get("type"), m.get("verts"), m.get("tris"),
        tuple(round(v, 3) for v in (m.get("dims") or [])), tuple(info.get("materials") or []),
    )


# --------------------------------------------------------------- texture dump --

def dump_textures():
    made = []
    for img in bpy.data.images:
        try:
            if img.size[0] == 0 or img.size[1] == 0:
                continue
            name = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in img.name)
            path = os.path.join(OUT, "tex_%s.png" % name)
            w, h = img.size
            scale = min(1.0, FAST_TEX / max(w, h)) if FAST_TEX else 1.0
            nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
            if scale < 1.0:
                img_copy = img.copy()
                img_copy.scale(nw, nh)
            else:
                img_copy = img
            img_copy.filepath_raw = path
            img_copy.file_format = "PNG"
            img_copy.save()
            if img_copy is not img:
                bpy.data.images.remove(img_copy)
            made.append({"image": img.name, "file": os.path.basename(path),
                         "size": [w, h], "saved_size": [nw, nh],
                         "packed": bool(img.packed_file), "filepath": img.filepath,
                         "colorspace": str(img.colorspace_settings.name)
                         if img.colorspace_settings else None,
                         "bytes": os.path.getsize(path)})
        except Exception as exc:  # noqa: BLE001
            log("TEXTURE_FAILED", img.name, exc)
    emit_json("textures.json", made, indent=1)
    return made


# ----------------------------------------------------------- geometry capture --

def capture_geometry(objects, depsgraph):
    """Compact vertex/triangle dump, gzipped. Enough to rebuild a low-poly prop
    in three.js by hand."""
    blobs = {}
    index = []
    total = 0
    for info in objects:
        if info["type"] != "MESH" or len(index) >= MAX_GEOM_OBJECTS:
            continue
        obj = bpy.data.objects.get(info["name"])
        if not obj:
            continue
        try:
            ev = obj.evaluated_get(depsgraph)
            me = ev.to_mesh()
            me.calc_loop_triangles()
            if len(me.loop_triangles) > MAX_GEOM_TRIS or not len(me.vertices):
                ev.to_mesh_clear()
                continue
            key = signature(info)
            if key in blobs:
                index.append({"name": obj.name, "dup_of": index[[i["key"] for i in index].index(key)]["name"]})
                ev.to_mesh_clear()
                continue
            verts = np.array([v.co[:] for v in me.vertices], dtype=np.float32)
            idx = np.array([i.vertices[:] for i in me.loop_triangles], dtype=np.uint32).reshape(-1)
            cols = None
            for ca in getattr(me, "color_attributes", []) or []:
                try:
                    arr = np.array([d.color[:] for d in ca.data], dtype=np.float32)
                    if len(arr) == len(verts):
                        cols = [[rnd(float(c), 4) for c in row] for row in arr]
                        break
                except Exception:  # noqa: BLE001
                    pass
            blobs[key] = None
            index.append({
                "key": key, "name": obj.name, "verts": int(len(verts)),
                "tris": int(len(idx) // 3),
                "matrix_world": [rnd(v) for row in obj.matrix_world for v in row],
                "materials": info.get("materials"),
                "geometry": [rnd(v) for v in verts.reshape(-1)],
                "indices": [int(v) for v in idx],
                "colors": cols,
            })
            total += len(verts)
            ev.to_mesh_clear()
        except Exception as exc:  # noqa: BLE001
            log("GEOM_FAILED", info["name"], exc)
    emit_json("geometry_index.json", [{"key": i.get("key"), "name": i.get("name"),
                                       "verts": i.get("verts"), "tris": i.get("tris"),
                                       "dup_of": i.get("dup_of")} for i in index], indent=1)
    payload = [i for i in index if "geometry" in i]
    raw = json.dumps(payload).encode()
    with gzip.open(os.path.join(OUT, "geometry.json.gz"), "wb") as fh:
        fh.write(raw)
    log("geometry: %d meshes, %d verts, %d bytes raw -> %d gz" % (
        len(payload), total, len(raw), os.path.getsize(os.path.join(OUT, "geometry.json.gz"))))


# ------------------------------------------------------------------- renders --

def set_engine(name):
    try:
        bpy.context.scene.render.engine = name
        return True
    except Exception:  # noqa: BLE001
        return False


def choose_engine():
    for name in ("CYCLES", "BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if set_engine(name):
            log("render engine:", name)
            return name
    return str(bpy.context.scene.render.engine)


def setup_render(fast):
    sc = bpy.context.scene
    engine = choose_engine()
    if engine == "CYCLES":
        sc.cycles.device = "CPU"
        sc.cycles.samples = 16 if fast else 32
        sc.cycles.use_denoising = False
        sc.cycles.max_bounces = 3
        sc.cycles.transmission_bounces = 2
        for key, val in (("use_persistent_data", True), ("use_fast_gi", True)):
            if hasattr(sc.cycles, key):
                try:
                    setattr(sc.cycles, key, val)
                except Exception:  # noqa: BLE001
                    pass
    elif engine.startswith("BLENDER_EEVEE"):
        if hasattr(sc.eevee, "taa_render_samples"):
            sc.eevee.taa_render_samples = 16
    sc.render.image_settings.file_format = "PNG"
    sc.render.film_transparent = False
    return engine


def ensure_world():
    sc = bpy.context.scene
    if sc.world is None:
        sc.world = bpy.data.worlds.new("model_probe_world")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    if bg:
        try:
            bg.inputs[0].default_value = (0.55, 0.72, 0.88, 1.0)
            bg.inputs[1].default_value = 1.0
        except Exception:  # noqa: BLE001
            pass


def ensure_light():
    sc = bpy.context.scene
    if not any(o.type == "LIGHT" for o in bpy.data.objects):
        data = bpy.data.lights.new("probe_sun", "SUN")
        data.energy = 4.0
        data.angle = math.radians(6)
        sun = bpy.data.objects.new("probe_sun", data)
        sun.rotation_euler = (math.radians(52), 0, math.radians(35))
        sc.collection.objects.link(sun)
        return sun
    return None


def scene_bounds(objs):
    pts = []
    for obj in objs:
        if obj.type != "MESH":
            continue
        try:
            for corner in obj.bound_box:
                pts.append(obj.matrix_world @ Vector(corner))
        except Exception:  # noqa: BLE001
            pass
    if not pts:
        pts = [Vector((0, 0, 0)), Vector((1, 1, 1))]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    zs = [p.z for p in pts]
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def frame_camera(cam, target, direction, dist, ortho=False, ortho_scale=None):
    d = Vector(direction).normalized()
    cam.location = Vector(target) + d * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho_scale or dist
    else:
        cam.data.type = "PERSP"


def render_to(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    try:
        bpy.ops.render.render(write_still=True)
        return os.path.exists(path) and os.path.getsize(path) > 1000
    except Exception as exc:  # noqa: BLE001
        log("RENDER_FAILED", path, exc)
        traceback.print_exc()
        return False


def try_opengl(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    try:
        sh = sc.display.shading
        sh.light = "STUDIO"
        sh.color_type = "MATERIAL"
        sh.show_shadows = True
        sh.show_cavity = True
        bpy.ops.render.opengl(write_still=True)
        if os.path.exists(path) and os.path.getsize(path) > 1000:
            luma = image_luma(path)
            log("opengl render luma:", luma)
            return luma > 0.02
    except Exception as exc:  # noqa: BLE001
        log("opengl unavailable:", exc)
    return False


def image_luma(path):
    try:
        img = bpy.data.images.load(path)
        arr = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)[:, :3]
        bpy.data.images.remove(img)
        return float(arr.mean())
    except Exception:  # noqa: BLE001
        return -1.0


def hide_fog_and_clouds():
    for o in bpy.data.objects:
        if o.name.startswith(("CLOUDS", "Cloud", "atmoFog", "Fog", "vento", "wind")):
            o.hide_render = True


def render_views(objs, engine):
    """Scene-level renders, framed on the whole model set."""
    sc = bpy.context.scene
    ensure_world()
    ensure_light()
    hide_fog_and_clouds()

    cam_data = bpy.data.cameras.new("probe_cam")
    cam = bpy.data.objects.new("probe_cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam

    x0, x1, y0, y1, z0, z1 = scene_bounds(objs)
    cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    span = max(x1 - x0, y1 - y0, z1 - z0, 0.5)
    target = Vector((cx, cy, cz))
    log("bounds x[%s,%s] y[%s,%s] z[%s,%s] span=%s" % (
        round(x0, 2), round(x1, 2), round(y0, 2), round(y1, 2), round(z0, 2), round(z1, 2), round(span, 2)))

    sc.render.resolution_x, sc.render.resolution_y = 640, 440
    views = [
        ("TOP", "ORTHO", (cx, cy, z1 + span * 1.2), (0, 0, 0), span * 1.15),
        ("ISO", "PERSP", (cx - span * 0.9, cy - span * 0.9, cz + span * 0.55), None, 0),
        ("LOW", "PERSP", (cx + span * 0.8, cy - span * 0.6, cz + span * 0.08), None, 0),
        ("HERO", "PERSP", (cx - span * 0.3, cy - span * 1.05, cz + span * 0.28), None, 0),
        ("CLOSE", "PERSP", (cx + span * 0.18, cy - span * 0.2, cz + span * 0.06), None, 0),
    ]
    made = []
    for name, kind, loc, rot, ortho in views:
        cam_data.type = kind
        cam_data.lens = 42
        if kind == "ORTHO":
            cam_data.ortho_scale = ortho
            cam.rotation_euler = rot
        else:
            cam.rotation_euler = (target - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        cam.location = loc
        path = os.path.join(OUT, "view_%s.png" % name.lower())
        if render_to(path):
            made.append(os.path.basename(path))
            log("rendered", os.path.basename(path))

    # The scene's own camera, if the file has one: the artist's framing.
    for obj in bpy.data.objects:
        if obj.type == "CAMERA" and not obj.name.startswith("probe_cam"):
            sc.camera = obj
            path = os.path.join(OUT, "view_scenecamera.png")
            if render_to(path):
                made.append("view_scenecamera.png")
                log("rendered view_scenecamera.png via", obj.name)
            sc.camera = cam
            break
    return made


def render_objects(groups, engine, use_opengl):
    """One render per de-duplicated model, framed individually."""
    sc = bpy.context.scene
    cam = sc.camera
    if cam is None:
        return []
    made = []
    sc.render.resolution_x, sc.render.resolution_y = (420, 300)
    count = 0
    for sig, group in groups.items():
        if count >= MAX_OBJ_RENDERS or group["type"] != "MESH":
            continue
        name = group["sample"]
        obj = bpy.data.objects.get(name)
        if not obj:
            continue
        x0, x1, y0, y1, z0, z1 = scene_bounds([obj])
        cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
        span = max(x1 - x0, y1 - y0, z1 - z0, 0.05)
        cam.data.type = "PERSP"
        cam.data.lens = 50
        cam.location = Vector((cx + span * 1.6, cy - span * 1.8, cz + span * 0.9))
        cam.rotation_euler = (Vector((cx, cy, cz)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(OUT, "obj_%03d_%s.png" % (
            count, "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name)))
        ok = try_opengl(path) if use_opengl else render_to(path)
        if ok:
            made.append(os.path.basename(path))
            log("rendered", os.path.basename(path), "(%d of %d)" % (count + 1, len(groups)))
        count += 1
    return made


# -------------------------------------------------------------------- driver --

def main():
    src = load_source()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    sc = bpy.context.scene

    scene = {
        "source": src,
        "blender_version": bpy.app.version_string,
        "blender_file_version": bpy.data.version,
        "scene": {"name": sc.name, "frame": sc.frame_current,
                  "fps": sc.render.fps, "frame_start": sc.frame_start,
                  "frame_end": sc.frame_end},
        "render": {
            "engine": str(sc.render.engine),
            "resolution": [sc.render.resolution_x, sc.render.resolution_y,
                           sc.render.resolution_percentage],
            "film_transparent": sc.render.film_transparent,
        },
        "color_management": {
            "view_transform": str(sc.view_settings.view_transform),
            "look": str(sc.view_settings.look),
            "exposure": rnd(sc.view_settings.exposure),
            "gamma": rnd(sc.view_settings.gamma),
        },
        "world": None,
        "world_mist": {
            "use_mist": bool(sc.world.mist_settings.use_mist) if sc.world else None,
            "depth": rnd(sc.world.mist_settings.depth) if sc.world else None,
            "start": rnd(sc.world.mist_settings.start) if sc.world else None,
        },
        "collections": {c.name: [o.name for o in c.objects] for c in bpy.data.collections},
        "counts": {
            "objects": len(bpy.data.objects),
            "meshes": len([o for o in bpy.data.objects if o.type == "MESH"]),
            "materials": len(bpy.data.materials),
            "images": len(bpy.data.images),
            "total_verts": sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH"),
            "total_tris": sum(
                (o.data.calc_loop_triangles(), len(o.data.loop_triangles))[1]
                for o in bpy.data.objects if o.type == "MESH"),
        },
    }
    w = sc.world
    if w and w.use_nodes:
        bg = w.node_tree.nodes.get("Background")
        if bg:
            scene["world"] = {
                "color": [rnd(c) for c in bg.inputs[0].default_value],
                "strength": rnd(bg.inputs[1].default_value),
            }

    # every object, fully described
    objects = []
    for obj in bpy.data.objects:
        try:
            objects.append(object_dump(obj, depsgraph))
        except Exception as exc:  # noqa: BLE001
            log("OBJECT_FAILED", obj.name, exc)
    emit_json("objects.json", objects, indent=1)

    # de-duplicate into "models"
    groups = {}
    for info in objects:
        sig = signature(info)
        g = groups.setdefault(sig, {"signature": sig, "type": info["type"],
                                    "count": 0, "names": [], "sample": info["name"],
                                    "materials": info.get("materials"),
                                    "mesh": info.get("mesh"),
                                    "world_dims": info.get("world_dims")})
        g["count"] += 1
        if len(g["names"]) < 25:
            g["names"].append(info["name"])
    for sig, g in groups.items():
        try:
            key = json.dumps(g, sort_keys=True, default=str)
        except Exception:  # noqa: BLE001
            key = sig
        g["mesh"] = {"verts": (g.get("mesh") or {}).get("verts"),
                     "tris": (g.get("mesh") or {}).get("tris"),
                     "dims": (g.get("mesh") or {}).get("dims")}
    emit_json("groups.json", sorted(groups.values(), key=lambda g: -(g.get("mesh", {}).get("verts") or 0)), indent=1)

    # materials
    mats = {}
    for mat in bpy.data.materials:
        try:
            mats[mat.name] = node_dump(mat)
        except Exception as exc:  # noqa: BLE001
            log("MAT_FAILED", mat.name, exc)
    emit_json("materials.json", mats, indent=1)

    dump_textures()

    # grid candidates: anything laid out as a height field (the ground)
    for info in objects:
        if info["type"] != "MESH":
            continue
        obj = bpy.data.objects.get(info["name"])
        if not obj:
            continue
        try:
            ev = obj.evaluated_get(depsgraph)
            me = ev.to_mesh()
            g = mesh_to_grid(obj, me)
            if g:
                step = max(1, int(round(math.sqrt(len(me.vertices)) / 150)))
                out = emit_grid(obj.name, g, step)
                log("GRID %s %dx%d span %s min_z %s max_z %s" % (
                    obj.name, out["size"][0], out["size"][1], out["span"],
                    out["min_z"], out["max_z"]))
            ev.to_mesh_clear()
        except Exception as exc:  # noqa: BLE001
            log("GRID_FAILED", info["name"], exc)

    capture_geometry(objects, depsgraph)

    # ---- renders
    try:
        engine = setup_render(fast=True)
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        engine = str(bpy.context.scene.render.engine)
    all_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    try:
        views = render_views(all_meshes, engine)
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        views = []
    use_opengl = False
    try:
        probe = os.path.join(OUT, "_opengl_test.png")
        use_opengl = try_opengl(probe)
        if not use_opengl and os.path.exists(probe):
            os.remove(probe)
    except Exception:  # noqa: BLE001
        use_opengl = False
    log("per-object renders via", "opengl/workbench" if use_opengl else "cycles")
    try:
        objs = render_objects(groups, engine, use_opengl)
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        objs = []

    # ---- human summary
    lines = []
    lines.append("SOURCE %s  (blender %s, file version %s)" % (
        src, bpy.app.version_string, bpy.data.version))
    lines.append("RENDER engine=%s view_transform=%s exposure=%s" % (
        scene["render"]["engine"], scene["color_management"]["view_transform"],
        scene["color_management"]["exposure"]))
    lines.append("COUNTS %s" % json.dumps(scene["counts"]))
    lines.append("WORLD %s" % json.dumps(scene["world"]))
    lines.append("")
    lines.append("MODELS (de-duplicated, biggest first)")
    for g in sorted(groups.values(), key=lambda g: -(g.get("mesh", {}).get("verts") or 0)):
        m = g.get("mesh") or {}
        lines.append("  %-28s x%-4d verts=%-6s tris=%-6s dims=%-26s mats=%s" % (
            (g["sample"] or "")[:28], g["count"], m.get("verts"), m.get("tris"),
            m.get("dims"), g.get("materials")))
    lines.append("")
    lines.append("")
    lines.append("PROFILES (world bounds, so a model can be stood on the ground)")
    for g in sorted(groups.values(), key=lambda g: -(g.get("mesh", {}).get("verts") or 0)):
        name = g["sample"]
        obj = bpy.data.objects.get(name)
        if not obj or obj.type != "MESH":
            continue
        try:
            pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
            lines.append("  %-24s x%-3d world x[%6.2f %6.2f] y[%7.3f %7.3f] z[%6.2f %6.2f]" % (
                name[:24], g["count"],
                min(p.x for p in pts), max(p.x for p in pts),
                min(p.y for p in pts), max(p.y for p in pts),
                min(p.z for p in pts), max(p.z for p in pts)))
        except Exception:  # noqa: BLE001
            pass
    lines.append("")
    lines.append("OBJECT TYPES %s" % json.dumps(
        {t: len([o for o in objects if o["type"] == t]) for t in sorted({o["type"] for o in objects})}))
    lines.append("MATERIALS %s" % ", ".join(sorted(mats)))
    lines.append("RENDERS %s" % ", ".join(views + objs))
    write("summary.txt", "\n".join(lines) + "\n")
    write("probe.log", "\n".join(LOG) + "\n")
    print("MODEL_PROBE_DONE")


try:
    main()
except Exception:  # noqa: BLE001
    traceback.print_exc()
    write("probe.log", "\n".join(LOG) + "\n" + traceback.format_exc())
    print("MODEL_PROBE_FAILED")
