/**
 * scenery.js — the owner's low-poly scenery kit, built into the game.
 *
 * The kit (scenery-data.js, baked by .github/bake_scenery.mjs from the .glb the
 * owner shared) is a diorama piece: a slab of land with a hill, a bowl holding a
 * lake, five shapes of rock and three conifers — every shape low-poly and
 * flat-shaded, which is the whole character of the thing.
 *
 * This module turns that data back into three.js geometry and assembles it:
 *
 *   kitIsland(spec)    the slab, its lake, and a dressing of the kit's own rocks
 *                      and trees, sized and dropped to sit in the terrain
 *   kitPropGeometry()  the rock and conifer shapes on their own, painted, so the
 *                      world can scatter them on the ground the way the kit does
 *   kitHeight(lx, lz)  the island's own height field, in kit units — the world
 *                      blends the district's terrain up to it, so the island can
 *                      be walked on instead of just looked at
 *
 * Nothing is fetched: the kit travels with the game as data, and the geometry is
 * unpacked once and shared between every district.
 */

import * as THREE from "three";
import { SCENERY_KIT } from "./scenery-data.js";

const K = SCENERY_KIT;

/* ------------------------------------------------------------------ unpack */

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** int16 positions + uint16 indices -> Float32Array positions, Uint16Array index */
function decode(q) {
  const pos = new Int16Array(base64ToBytes(q.pos).buffer);
  const idx = new Uint16Array(base64ToBytes(q.idx).buffer);
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    out[i] = (pos[i] + q.lim) * q.scale[0] + q.min[0];
    out[i + 1] = (pos[i + 1] + q.lim) * q.scale[1] + q.min[1];
    out[i + 2] = (pos[i + 2] + q.lim) * q.scale[2] + q.min[2];
  }
  return { positions: out, indices: idx };
}

function geometryFrom(q) {
  const { positions, indices } = decode(q);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

/** deterministic per-coordinate randomness (same helper world.js uses) */
function h2(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

const UP = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------------- field */

let FIELD = null;

/**
 * The island's own height at kit coordinates (lx, lz) — the same ground the kit
 * itself is built on. NaN means "off the island".
 */
export function kitHeight(lx, lz) {
  if (!FIELD) {
    const f = K.island.field;
    const raw = new Int16Array(base64ToBytes(f.data).buffer);
    const z = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      z[i] = raw[i] === -32768 ? NaN : (raw[i] + f.lim) * f.scale + f.base;
    }
    FIELD = { ...f, z };
  }
  const fi = (lx - FIELD.minX) / FIELD.dx;
  const fj = (lz - FIELD.minZ) / FIELD.dz;
  const i = Math.floor(fi), j = Math.floor(fj);
  if (i < 0 || j < 0 || i >= FIELD.size - 1 || j >= FIELD.size - 1) return NaN;
  const tx = fi - i, tz = fj - j;
  const a = FIELD.z[j * FIELD.size + i], b = FIELD.z[j * FIELD.size + i + 1];
  const c = FIELD.z[(j + 1) * FIELD.size + i], d = FIELD.z[(j + 1) * FIELD.size + i + 1];
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) return NaN;
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/**
 * What the baker measured off the kit, in kit units. Height is y (the game's
 * up): the slab's rim sits at rimZ, its lake surface at lakeZ, its summit at
 * peakY, and the slab is footprint units across.
 */
export const KIT_INFO = {
  rimZ: K.island.rimZ,
  lakeZ: K.island.lakeZ,
  peakY: K.island.peakY,
  floorY: K.island.floorY,
  footprint: K.island.footprint,
  outline: K.island.outline,
  outlineMean: K.island.outlineMean,
  outlineRadius: K.island.outlineRadius,
  skirtDrop: K.island.skirtDrop,
  source: K.source,
};

/* ---------------------------------------------------------------- geometry */

const PALETTE = {
  land: new THREE.Color(0x8fc44e),
  grass: new THREE.Color(0x9ec848),
  high: new THREE.Color(0x86b844),
  sand: new THREE.Color(0xdcd39a),
  bed: new THREE.Color(0x4f7f56),
  rock: new THREE.Color(0x9a9887),
  rockDark: new THREE.Color(0x7d7c6e),
  bark: new THREE.Color(0x6b4a2f),
  needle: new THREE.Color(0x2f6b2a),
  needleLight: new THREE.Color(0x3f8a33),
};

/**
 * Colour the slab with the game's own ground palette (the biome tints in
 * world.js) instead of the kit's flat grey, so an island reads as part of
 * Keralam's terrain: green on the hill, sand at the waterline, the lake bed
 * darker, and the kit's grey on anything steep enough to be bare rock.
 */
function paintIsland(geo) {
  const { rimZ, lakeZ } = K.island;
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) - rimZ;                    // kit units above the rim
    n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    const flat = Math.max(0, n.dot(UP));
    c.copy(PALETTE.land);
    if (h < lakeZ - rimZ + 0.02) {
      c.copy(PALETTE.bed).lerp(PALETTE.sand, Math.min(1, Math.max(0, (h - (lakeZ - rimZ)) * 6)));
    } else if (h < 0.05) {
      c.copy(PALETTE.sand).lerp(PALETTE.grass, Math.max(0, h / 0.05));
    } else if (h > 0.2) {
      c.copy(PALETTE.grass).lerp(PALETTE.high, Math.min(1, (h - 0.2) / 0.2));
    }
    if (flat < 0.5 && h > 0.05) c.lerp(PALETTE.rock, Math.min(0.6, (0.5 - flat) * 1.7));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

let ISLAND_GEO = null;
let LAKE_GEO = null;
let PROPS = null;

/** the slab: the kit's land with its thin skirt already replaced by a deep wall */
export function kitIslandGeometry() {
  if (!ISLAND_GEO) {
    ISLAND_GEO = paintIsland(geometryFrom(K.island));
    ISLAND_GEO.name = "island-slab";
  }
  return ISLAND_GEO;
}

/** the lake surface that is actually visible inside the island's bowl */
export function kitLakeGeometry() {
  if (!LAKE_GEO && K.island.lake) {
    LAKE_GEO = geometryFrom(K.island.lake);
    LAKE_GEO.name = "island-lake";
  }
  return LAKE_GEO;
}

/**
 * The kit's props, painted: conifers are dark at the skirt and lighter towards
 * the crown, rocks are darker where they meet the ground. This is the kit's own
 * read (one colour per shape, lit by the scene) given the little bit of range
 * that a Lambert surface needs to sit well on the game's ground.
 */
export function kitProps() {
  if (PROPS) return PROPS;
  const rocks = [];
  const trees = [];
  for (const s of K.shapes) {
    if (s.role !== "rock" && s.role !== "tree") continue;   // the kit's sun is not scenery
    const geo = geometryFrom(s);
    const isTree = s.role === "tree";
    geo.computeBoundingBox();
    const lo = geo.boundingBox.min.y, hi = geo.boundingBox.max.y;
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let v = 0; v < pos.count; v++) {
      const t = (pos.getY(v) - lo) / Math.max(1e-4, hi - lo);
      if (isTree) {
        // a conifer reads as a dark tree with lighter tiers catching the light
        c.copy(PALETTE.needle).lerp(PALETTE.needleLight, Math.pow(t, 1.4));
      } else {
        c.copy(PALETTE.rockDark).lerp(PALETTE.rock, Math.pow(1 - t, 0.7));
      }
      colors[v * 3] = c.r;
      colors[v * 3 + 1] = c.g;
      colors[v * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const entry = { name: s.name, geo, height: 1, span: Math.max(
      geo.boundingBox.max.x - geo.boundingBox.min.x,
      geo.boundingBox.max.z - geo.boundingBox.min.z) };
    (isTree ? trees : rocks).push(entry);
  }
  rocks.sort((a, b) => a.span - b.span);      // smallest first
  PROPS = { rocks, trees };
  return PROPS;
}

/* -------------------------------------------------------------- assembling */

/**
 * One island, ready to drop into a district.
 *
 * spec = { x, z, scale, rimY, seed }
 *   x, z   where its middle sits in the district
 *   scale  how many metres one kit unit becomes (the island is 2.75 units across)
 *   rimY   the height its rim lands at — the world blends the surrounding
 *          terrain up to the island's edge, so this is what seats it in the hill
 *   seed   keeps the dressing stable from build to build
 *
 * Returns { root, colliders, lakeSpot, sway }:
 *   root       a group to add to the district
 *   colliders  trunks and boulders, in world coordinates
 *   lakeSpot   { x, z, r, y } for the swimming and fishing code (null if dry)
 */
export function kitIsland(spec, opts = {}) {
  const { x, z, scale, rimY, seed = 0 } = spec;
  const lite = !!opts.lite;
  const root = new THREE.Group();
  root.name = "island";
  root.position.set(x, rimY, z);
  root.scale.setScalar(scale);
  // the kit's ground plane is (x, y) and its up is z; three.js wants up = y, so
  // the geometry's own axes already line up: kit x -> x, kit y -> z, kit z -> y.

  // The kit's slab is smooth-shaded (its own bake: 2549 of 2549 faces smooth),
  // which is also how the game's ground is drawn — the two read as one surface.
  const slab = new THREE.Mesh(
    kitIslandGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false })
  );
  slab.receiveShadow = true;
  root.add(slab);

  const colliders = [];
  const sway = [];
  const { rocks, trees } = kitProps();
  // the kit's rocks and conifers are flat-shaded (faceted), the whole character
  // of low-poly scenery
  const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  // ---- rocks on the banks, the way the kit lays them out
  const wantRocks = lite ? 9 : 15;
  let placed = 0;
  for (let i = 0; i < wantRocks * 16 && placed < wantRocks; i++) {
    const a = h2(i + seed, 7.1) * Math.PI * 2;
    const r = 0.42 + Math.sqrt(h2(i + seed, 3.3)) * 0.95;        // kit units from the middle
    const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
    const kz = kitHeight(lx, lz);
    if (Number.isNaN(kz) || kz < K.island.lakeZ + 0.012) continue;   // in the lake: skip
    const shape = rocks[Math.floor(h2(i + seed, 5.5) * rocks.length) % rocks.length];
    const size = 0.9 + h2(i + seed, 9.9) * 2.3;                  // metres tall
    const m = new THREE.Mesh(shape.geo, rockMat);
    m.scale.setScalar(size / scale);
    m.position.set(lx, kz - 0.03, lz);
    m.rotation.y = h2(i + seed, 6.6) * 6.283;
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    colliders.push({ x: x + lx * scale, z: z + lz * scale, r: Math.max(0.35, size * 0.4) });
    placed++;
  }

  // ---- conifers up on the hill, where the kit stands them
  const wantTrees = lite ? 5 : 8;
  let planted = 0;
  for (let i = 0; i < wantTrees * 20 && planted < wantTrees; i++) {
    const a = h2(i + seed, 11.3) * Math.PI * 2;
    const r = Math.sqrt(h2(i + seed, 13.7)) * 0.6;               // off the shore ring
    const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
    const kz = kitHeight(lx, lz);
    if (Number.isNaN(kz) || kz < 0.07) continue;                 // the hill, not the bank
    const shape = trees[Math.floor(h2(i + seed, 17.1) * trees.length) % trees.length];
    const m = new THREE.Mesh(shape.geo, treeMat);
    const height = 6.5 + h2(i + seed, 19.3) * 4.5;               // metres
    m.scale.setScalar(height / scale);
    m.position.set(lx, kz - 0.03, lz);
    m.rotation.y = h2(i + seed, 23.9) * 6.283;
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.wind = {
      ph: h2(i + seed, 29.1) * 6.283,
      spd: 0.5 + h2(i + seed, 31.7) * 0.6,
      amp: 0.02,
      yaw: m.rotation.y,
      wx: x + lx * scale,      // world position, for the "player brushes past" sway
      wz: z + lz * scale,
    };
    sway.push(m);
    root.add(m);
    colliders.push({ x: x + lx * scale, z: z + lz * scale, r: Math.max(0.45, height * 0.045) });
    planted++;
  }

  // ---- the lake in the bowl the kit carved
  let lakeSpot = null;
  if (K.island.lake) {
    const lake = new THREE.Mesh(
      kitLakeGeometry(),
      new THREE.MeshLambertMaterial({ color: 0x3f8fa8, transparent: true, opacity: 0.88 })
    );
    lake.receiveShadow = false;
    root.add(lake);
    const r = Math.max(0.55, K.island.outlineMean * 0.40);
    lakeSpot = { x, z, r: r * scale, y: rimY + K.island.lakeZ * scale };
  }

  return { root, colliders, lakeSpot, sway, spec };
}

export const KIT_SOURCE = K.source;
