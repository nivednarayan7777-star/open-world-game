#!/usr/bin/env node
/**
 * bake_scenery.mjs — turn the owner's low-poly scenery kit (a .glb from Drive:
 * one hill slab with a lake, five rock shapes and three conifers) into the
 * compact data module the game loads.
 *
 * What it does, in order:
 *   1. reads the .glb (glTF binary: JSON chunk + BIN chunk, no textures)
 *   2. welds each mesh's vertices and applies its node matrix
 *   3. de-duplicates identical shapes (the kit ships 6 copies of one rock, and
 *      three conifers that differ only by scale)
 *   4. rebuilds the hill slab: finds its boundary loop, drops the original thin
 *      skirt and extrudes a deep one, so the slab can be sunk into the game's
 *      terrain without ever showing a gap
 *   5. clips the kit's water sheet down to the lake that is actually visible
 *      inside the hill's bowl (the sheet is a full square of sea)
 *   6. bakes a height field of the slab so the game can walk on the hills
 *   7. quantises positions to int16 and writes scenery-data.js
 *
 * Usage: node .github/bake_scenery.mjs [source.glb] [out.js]
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const SRC = process.argv[2] || "probe/model/source.glb";
const OUT = process.argv[3] || "scenery-data.js";

/* --------------------------------------------------------------- glb reader */

function readGlb(file) {
  const raw = fs.readFileSync(file);
  if (raw.readUInt32LE(0) !== 0x46546c67) throw new Error("not a .glb");
  let off = 12;
  let json = null;
  let bin = null;
  while (off < raw.length) {
    const len = raw.readUInt32LE(off);
    const type = raw.readUInt32LE(off + 4);
    const body = raw.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8"));
    else if (type === 0x004e4942) bin = body;
    off += 8 + len + ((4 - (len % 4)) % 4) * 0;
  }
  return { json, bin };
}

const COMP = {
  5120: { size: 1, get: (dv, o) => dv.getInt8(o), arr: Int8Array },
  5121: { size: 1, get: (dv, o) => dv.getUint8(o), arr: Uint8Array },
  5122: { size: 2, get: (dv, o) => dv.getInt16(o, true), arr: Int16Array },
  5123: { size: 2, get: (dv, o) => dv.getUint16(o, true), arr: Uint16Array },
  5125: { size: 4, get: (dv, o) => dv.getUint32(o, true), arr: Uint32Array },
  5126: { size: 4, get: (dv, o) => dv.getFloat32(o, true), arr: Float32Array },
};
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(gltf, bin, index) {
  const acc = gltf.accessors[index];
  const view = gltf.bufferViews[acc.bufferView];
  const comp = COMP[acc.componentType];
  const n = NCOMP[acc.type];
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = view.byteStride || comp.size * n;
  const out = new Float64Array(acc.count * n);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) out[i * n + c] = comp.get(dv, base + i * stride + c * comp.size);
  }
  return { data: out, count: acc.count, n };
}

/** column-major 4x4 from a glTF node */
function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const t = node.translation || [0, 0, 0];
  const s = node.scale || [1, 1, 1];
  const q = node.rotation || [0, 0, 0, 1];
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function applyMatrix(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/* ------------------------------------------------------------- mesh helpers */

/** weld by rounded position, returns { verts:[[x,y,z]], tris:[i,i,i], normals } */
function weld(points, indices, normals) {
  const map = new Map();
  const verts = [];
  const remap = new Int32Array(points.length / 3);
  for (let i = 0; i < points.length / 3; i++) {
    const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = verts.length;
      map.set(key, id);
      verts.push([x, y, z]);
    }
    remap[i] = id;
  }
  const tris = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = remap[indices[i]], b = remap[indices[i + 1]], c = remap[indices[i + 2]];
    if (a === b || b === c || a === c) continue;
    tris.push(a, b, c);
  }
  // per-vertex normal sets, to tell smooth from flat shading
  let flat = false;
  if (normals) {
    const seen = new Map();
    for (let i = 0; i < points.length / 3; i++) {
      const id = remap[i];
      const nx = Math.round(normals[i * 3] * 100), ny = Math.round(normals[i * 3 + 1] * 100),
        nz = Math.round(normals[i * 3 + 2] * 100);
      const k = `${nx},${ny},${nz}`;
      let set = seen.get(id);
      if (!set) { set = new Set(); seen.set(id, set); }
      set.add(k);
    }
    for (const set of seen.values()) if (set.size > 1) { flat = true; break; }
  }
  return { verts, tris, flat };
}

function shapeKey(mesh) {
  const bbox = bboxOf(mesh.verts);
  const scale = Math.max(bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]) || 1;
  const key = [];
  for (const v of mesh.verts) {
    key.push(
      Math.round((v[0] - bbox.min[0]) / scale * 1000),
      Math.round((v[1] - bbox.min[1]) / scale * 1000),
      Math.round((v[2] - bbox.min[2]) / scale * 1000),
    );
  }
  return `${mesh.verts.length}:${key.slice(0, 600).join(",")}`;
}

function bboxOf(verts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const v of verts) {
    for (let i = 0; i < 3; i++) {
      if (v[i] < min[i]) min[i] = v[i];
      if (v[i] > max[i]) max[i] = v[i];
    }
  }
  return { min, max };
}

function normalise(mesh, targetHeight = 1) {
  const bbox = bboxOf(mesh.verts);
  const h = bbox.max[2] - bbox.min[2] || 1;
  const k = targetHeight / h;
  const cx = (bbox.min[0] + bbox.max[0]) / 2;
  const cy = (bbox.min[1] + bbox.max[1]) / 2;
  const z0 = bbox.min[2];
  return {
    verts: mesh.verts.map(([x, y, z]) => [(x - cx) * k, (y - cy) * k, (z - z0) * k]),
    tris: mesh.tris,
    height: h,
    footprint: [(bbox.max[0] - bbox.min[0]) * k, (bbox.max[1] - bbox.min[1]) * k],
    flat: mesh.flat,
  };
}

/* --------------------------------------------------------------- quantising */

function quantise(mesh, bits = 15) {
  const bbox = bboxOf(mesh.verts);
  const pad = 1e-4;
  const min = bbox.min.map((v) => v - pad);
  const max = bbox.max.map((v) => v + pad);
  const lim = (1 << (bits - 1)) - 1;
  const scale = max.map((v, i) => (v - min[i]) / (2 * lim));
  const pos = new Int16Array(mesh.verts.length * 3);
  mesh.verts.forEach((v, i) => {
    for (let c = 0; c < 3; c++) {
      pos[i * 3 + c] = Math.max(-lim - 1, Math.min(lim, Math.round((v[c] - min[c]) / scale[c] - lim)));
    }
  });
  const idx = new Uint16Array(mesh.tris);
  return {
    min, scale, lim,
    pos: Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength).toString("base64"),
    idx: Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength).toString("base64"),
    verts: mesh.verts.length,
    tris: mesh.tris.length / 3,
  };
}

/* --------------------------------------------------------- slab (the island) */

function boundaryLoops(verts, tris) {
  const edges = new Map();
  const add = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const e = edges.get(key) || { a: Math.min(a, b), b: Math.max(a, b), n: 0 };
    e.n++;
    edges.set(key, e);
  };
  for (let i = 0; i < tris.length; i += 3) {
    add(tris[i], tris[i + 1]);
    add(tris[i + 1], tris[i + 2]);
    add(tris[i + 2], tris[i]);
  }
  const adj = new Map();
  let open = 0;
  for (const e of edges.values()) {
    if (e.n !== 1) continue;
    open++;
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e.b);
    adj.get(e.b).push(e.a);
  }
  const loops = [];
  const used = new Set();
  for (const start of adj.keys()) {
    if (used.has(start)) continue;
    const loop = [start];
    used.add(start);
    let prev = null;
    let cur = start;
    while (true) {
      const next = (adj.get(cur) || []).find((n) => n !== prev && !used.has(n));
      if (next === undefined) break;
      used.add(next);
      loop.push(next);
      prev = cur;
      cur = next;
    }
    if (loop.length > 3) loops.push(loop);
  }
  return { loops, openEdges: open };
}

/** extrude the slab's outline straight down so it can be buried anywhere */
function extendSkirt(slab, drop) {
  const { loops } = boundaryLoops(slab.verts, slab.tris);
  const verts = slab.verts.map((v) => v.slice());
  const tris = slab.tris.slice();
  for (const loop of loops) {
    const ring = loop.map((i) => {
      verts.push([slab.verts[i][0], slab.verts[i][1], slab.verts[i][2] - drop]);
      return verts.length - 1;
    });
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const a2 = ring[i], b2 = ring[(i + 1) % loop.length];
      // outward-facing wall: the slab's boundary runs clockwise seen from above
      tris.push(a, b, b2, a, b2, a2);
      tris.push(a, a2, b2, a, b2, b);
    }
  }
  return { verts, tris, loops, drop };
}

/** rasterise the top surface into a height field, then sample it */
function bakeField(verts, tris, size, pad = 0.02) {
  const bbox = bboxOf(verts);
  const minX = bbox.min[0] - pad, maxX = bbox.max[0] + pad;
  const minY = bbox.min[1] - pad, maxY = bbox.max[1] + pad;
  const dx = (maxX - minX) / (size - 1);
  const dy = (maxY - minY) / (size - 1);
  const field = new Float32Array(size * size).fill(NaN);
  const gi = (x, y) => {
    const i = Math.round((x - minX) / dx), j = Math.round((y - minY) / dy);
    return i >= 0 && j >= 0 && i < size && j < size ? j * size + i : -1;
  };
  for (let t = 0; t < tris.length; t += 3) {
    const p = [verts[tris[t]], verts[tris[t + 1]], verts[tris[t + 2]]];
    const x0 = Math.min(p[0][0], p[1][0], p[2][0]), x1 = Math.max(p[0][0], p[1][0], p[2][0]);
    const y0 = Math.min(p[0][1], p[1][1], p[2][1]), y1 = Math.max(p[0][1], p[1][1], p[2][1]);
    const i0 = Math.max(0, Math.floor((x0 - minX) / dx) - 1), i1 = Math.min(size - 1, Math.ceil((x1 - minX) / dx) + 1);
    const j0 = Math.max(0, Math.floor((y0 - minY) / dy) - 1), j1 = Math.min(size - 1, Math.ceil((y1 - minY) / dy) + 1);
    const d = (p[1][1] - p[2][1]) * (p[0][0] - p[2][0]) + (p[2][0] - p[1][0]) * (p[0][1] - p[2][1]);
    if (Math.abs(d) < 1e-12) continue;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const X = minX + i * dx, Y = minY + j * dy;
        let l0 = ((p[1][1] - p[2][1]) * (X - p[2][0]) + (p[2][0] - p[1][0]) * (Y - p[2][1])) / d;
        let l1 = ((p[2][1] - p[0][1]) * (X - p[2][0]) + (p[0][0] - p[2][0]) * (Y - p[2][1])) / d;
        const l2 = 1 - l0 - l1;
        if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
        const z = l0 * p[0][2] + l1 * p[1][2] + l2 * p[2][2];
        const at = j * size + i;
        if (Number.isNaN(field[at]) || z > field[at]) field[at] = z;
      }
    }
  }
  return { field, size, minX, minY, dx, dy, minY2: minY, maxX, maxY };
}

function sampleField(f, x, y) {
  const fi = (x - f.minX) / f.dx;
  const fj = (y - f.minY) / f.dy;
  const i = Math.floor(fi), j = Math.floor(fj);
  if (i < 0 || j < 0 || i >= f.size - 1 || j >= f.size - 1) return NaN;
  const tx = fi - i, ty = fj - j;
  const a = f.field[j * f.size + i], b = f.field[j * f.size + i + 1];
  const c = f.field[(j + 1) * f.size + i], d = f.field[(j + 1) * f.size + i + 1];
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) return NaN;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** keep only the water triangles that stand above the slab: the visible lake */
function clipLake(water, field) {
  const verts = [];
  const tris = [];
  const map = new Map();
  const id = (v) => {
    const key = `${v[0].toFixed(4)},${v[1].toFixed(4)},${v[2].toFixed(4)}`;
    let i = map.get(key);
    if (i === undefined) {
      i = verts.length;
      map.set(key, i);
      verts.push(v);
    }
    return i;
  };
  let kept = 0;
  for (let t = 0; t < water.tris.length; t += 3) {
    const p = [water.verts[water.tris[t]], water.verts[water.tris[t + 1]], water.verts[water.tris[t + 2]]];
    const cz = (p[0][2] + p[1][2] + p[2][2]) / 3;
    const cx = (p[0][0] + p[1][0] + p[2][0]) / 3;
    const cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
    const ground = sampleField(field, cx, cy);
    if (Number.isNaN(ground)) continue;      // outside the island: open sea
    let above = 0;
    for (const q of p) {
      const g = sampleField(field, q[0], q[1]);
      if (!Number.isNaN(g) && q[2] > g + 0.004) above++;
    }
    if (above < 3 && cz < ground + 0.004) continue;   // hidden under the hills
    tris.push(id(p[0]), id(p[1]), id(p[2]));
    kept++;
  }
  return { verts, tris, kept };
}

/* --------------------------------------------------------------------- main */

const { json: gltf, bin } = readGlb(SRC);
const sha = crypto.createHash("sha256").update(fs.readFileSync(SRC)).digest("hex");

const meshes = new Map();   // node name -> welded mesh, world space
const localMeshes = new Map();  // node name -> welded mesh, node space (props)
for (const node of gltf.nodes) {
  if (node.mesh === undefined) continue;
  const prim = gltf.meshes[node.mesh].primitives[0];
  const pos = readAccessor(gltf, bin, prim.attributes.POSITION);
  const nrm = prim.attributes.NORMAL !== undefined ? readAccessor(gltf, bin, prim.attributes.NORMAL) : null;
  const localPoints = new Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    localPoints[i * 3] = pos.data[i * 3];
    localPoints[i * 3 + 1] = pos.data[i * 3 + 1];
    localPoints[i * 3 + 2] = pos.data[i * 3 + 2];
  }
  let localIndices;
  if (prim.indices !== undefined) {
    localIndices = Array.from(readAccessor(gltf, bin, prim.indices).data);
  } else {
    localIndices = Array.from({ length: pos.count }, (_, i) => i);
  }
  localMeshes.set(node.name, weld(localPoints, localIndices, nrm ? Array.from(nrm.data) : null));
  const m = nodeMatrix(node);
  const points = new Array(pos.count * 3);
  const normals = nrm ? new Array(nrm.count * 3) : null;
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = applyMatrix(m, pos.data[i * 3], pos.data[i * 3 + 1], pos.data[i * 3 + 2]);
    points[i * 3] = x; points[i * 3 + 1] = y; points[i * 3 + 2] = z;
    if (nrm) {
      // rotate the normal (uniform scale in this file)
      const [nx, ny, nz] = applyMatrix(m, nrm.data[i * 3], nrm.data[i * 3 + 1], nrm.data[i * 3 + 2]);
      const l = Math.hypot(nx, ny, nz) || 1;
      normals[i * 3] = nx / l; normals[i * 3 + 1] = ny / l; normals[i * 3 + 2] = nz / l;
    }
  }
  let indices;
  if (prim.indices !== undefined) {
    indices = Array.from(readAccessor(gltf, bin, prim.indices).data);
  } else {
    indices = Array.from({ length: pos.count }, (_, i) => i);
  }
  meshes.set(node.name, weld(points, indices, normals));
}

const names = [...meshes.keys()];
const island = meshes.get("Landscape");
const waterRaw = meshes.get("water");
const logs = [];
const log = (...a) => { logs.push(a.join(" ")); console.log(...a); };

log(`source ${SRC}`);
log(`  sha256 ${sha}`);
log(`  ${names.length} meshes: ${names.join(", ")}`);

// ---- de-duplicate shapes ---------------------------------------------------
const shapeGroups = new Map();
const shapeByNode = new Map();
for (const [name, local] of localMeshes) {
  if (name === "Landscape" || name === "water") continue;
  if (name === "Cube" || name === "sun") continue;   // stray default cube, kit's sun
  const mesh = local;
  const key = shapeKey(mesh);
  if (!shapeGroups.has(key)) shapeGroups.set(key, { names: [], mesh });
  shapeGroups.get(key).names.push(name);
  shapeByNode.set(name, shapeGroups.get(key));
}
log(`shapes after de-duplication: ${shapeGroups.size}`);
for (const g of shapeGroups.values()) {
  const bbox = bboxOf(g.mesh.verts);
  const dims = [bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]]
    .map((v) => v.toFixed(3)).join(" x ");
  log(`  ${(g.names[0] || "").padEnd(12)} x${String(g.names.length).padEnd(3)} verts=${g.mesh.verts.length} tris=${g.mesh.tris.length / 3} size=${dims} flat=${g.mesh.flat}`);
}

// ---- the slab --------------------------------------------------------------
const slabBBox = bboxOf(island.verts);
const { loops, openEdges } = boundaryLoops(island.verts, island.tris);
log(`slab: ${island.verts.length} verts, ${island.tris.length / 3} tris, ${openEdges} boundary edges in ${loops.length} loop(s)`);
log(`slab footprint ${(slabBBox.max[0] - slabBBox.min[0]).toFixed(3)} x ${(slabBBox.max[1] - slabBBox.min[1]).toFixed(3)}, z ${slabBBox.min[2].toFixed(3)}..${slabBBox.max[2].toFixed(3)}`);

// rim height: the outline's z (median), and the outline radius profile
const rimZ = (() => {
  const zs = [];
  for (const loop of loops) for (const i of loop) zs.push(island.verts[i][2]);
  zs.sort((a, b) => a - b);
  return zs[Math.floor(zs.length / 2)];
})();
const centre = [
  (slabBBox.min[0] + slabBBox.max[0]) / 2,
  (slabBBox.min[1] + slabBBox.max[1]) / 2,
];
// the rim polygon, centred, so the game knows exactly where the island ends
const outline = (() => {
  const loop = loops.slice().sort((a, b) => b.length - a.length)[0] || [];
  const pts = loop.map((i) => [island.verts[i][0] - centre[0], island.verts[i][1] - centre[1]]);
  const radii = pts.map((p) => Math.hypot(p[0], p[1]));
  return {
    pts: pts.map((p) => [+p[0].toFixed(4), +p[1].toFixed(4)]),
    z: loop.map((i) => +island.verts[i][2].toFixed(4)),
    mean: radii.reduce((a, b) => a + b, 0) / Math.max(1, radii.length),
    min: Math.min(...radii), max: Math.max(...radii),
  };
})();
log(`rim z ${rimZ.toFixed(3)}, outline ${outline.pts.length} points, radius ${outline.min.toFixed(3)}..${outline.max.toFixed(3)} (mean ${outline.mean.toFixed(3)})`);

const skirtDrop = +(0.10 + (slabBBox.max[2] - rimZ)).toFixed(3);
const skirted = extendSkirt(island, Math.max(skirtDrop, 0.25));
log(`skirt: dropped ${Math.max(skirtDrop, 0.25)} (rim to peak is ${(slabBBox.max[2] - rimZ).toFixed(3)})`);

const field = bakeField(skirted.verts, island.tris, 65, 0.02);
let filled = 0;
for (const v of field.field) if (!Number.isNaN(v)) filled++;
log(`height field 65x65, ${filled} cells covered, spacing ${field.dx.toFixed(4)}`);

// ---- the lake --------------------------------------------------------------
const lake = clipLake(waterRaw, field);
const lakeZ = waterRaw.verts.reduce((a, v) => a + v[2], 0) / waterRaw.verts.length;
log(`lake: kept ${lake.kept} of ${waterRaw.tris.length / 3} water tris, surface z ${lakeZ.toFixed(4)}`);
if (lake.verts.length) {
  const b = bboxOf(lake.verts);
  log(`lake bbox x[${b.min[0].toFixed(3)} ${b.max[0].toFixed(3)}] y[${b.min[1].toFixed(3)} ${b.max[1].toFixed(3)}]`);
}

// ---- pack ------------------------------------------------------------------
const shapes = [];
for (const g of shapeGroups.values()) {
  const base = g.names[0].replace(/\.\d+$/, "");
  let role = "prop";
  let height = null;
  let mesh = g.mesh;
  if (base.startsWith("tree")) { role = "tree"; mesh = normalise(mesh, 1); height = 1; }
  else if (base.startsWith("rock")) { role = "rock"; mesh = normalise(mesh, 1); height = 1; }
  else if (base === "sun") { role = "sun"; }
  shapes.push({ name: base, role, count: g.names.length, flat: mesh.flat, height, footprint: mesh.footprint, ...quantise(mesh) });
}

const fieldQ = (() => {
  const out = new Int16Array(field.size * field.size);
  const lim = 32767;
  const scale = (slabBBox.max[2] - slabBBox.min[2] + 2) / (2 * lim);
  const base = slabBBox.min[2] - 1;
  field.field.forEach((v, i) => {
    out[i] = Number.isNaN(v) ? -32768 : Math.round((v - base) / scale - lim);
  });
  return {
    base, scale, lim, size: field.size, minX: field.minX, minY: field.minY, dx: field.dx, dy: field.dy,
    data: Buffer.from(out.buffer, out.byteOffset, out.byteLength).toString("base64"),
  };
})();

const islandPacked = {
  ...quantise(skirted),
  rimZ, lakeZ, skirtDrop: Math.max(skirtDrop, 0.25),
  footprint: [slabBBox.max[0] - slabBBox.min[0], slabBBox.max[1] - slabBBox.min[1]],
  centre, outline: outline.pts, outlineZ: outline.z, outlineMean: outline.mean,
  outlineRadius: [outline.min, outline.max],
  peakZ: slabBBox.max[2], floorZ: slabBBox.min[2],
  field: fieldQ,
  lake: lake.verts.length ? { ...quantise(lake), z: lakeZ } : null,
};

const data = {
  version: 1,
  source: { file: path.basename(SRC), sha256: sha, generator: gltf.asset && gltf.asset.generator },
  island: islandPacked,
  shapes,
};

const header = `/**
 * scenery-data.js — the owner's low-poly scenery kit, baked for the game.
 *
 * Generated by .github/bake_scenery.mjs from ${path.basename(SRC)}
 * (sha256 ${sha.slice(0, 16)}…, exported ${gltf.asset ? gltf.asset.generator : "glTF"}).
 * Do not edit by hand: re-run the baker.
 *
 * Contents: the hill-with-a-lake slab (plus its deep skirt and a 65x65 height
 * field so the game can walk on it), the lake surface clipped out of the kit's
 * sea sheet, and the kit's rock and conifer shapes. Positions are int16 in each
 * shape's own box; scenery.js turns them back into geometry.
 */`;

fs.writeFileSync(OUT, `${header}\nexport const SCENERY_KIT = ${JSON.stringify(data)};\n`);
log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
fs.writeFileSync(OUT.replace(/\.js$/, ".log.txt"), logs.join("\n") + "\n");
