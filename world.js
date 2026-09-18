import * as THREE from "three";
import { shared } from "./tex.js";
import { DISTRICTS, getDistrict, roadsFor } from "./districts.js";
import { kitIsland, kitHeight, kitProps, KIT_INFO, KIT_SOURCE } from "./scenery.js";

function SM(color, kind, extra = {}) {
  const T = shared();
  const maps = {
    plaster: [T.plaster, T.plasterN],
    laterite: [T.laterite, T.lateriteN],
    wood: [T.wood, T.woodN],
    tile: [T.tile, T.tileN],
    bark: [T.bark, null],
    leaf: [T.leaf, null],
  };
  const [map, nrm] = maps[kind] || [null, null];
  return new THREE.MeshStandardMaterial({
    color, map, normalMap: nrm,
    roughness: extra.roughness ?? 0.8,
    metalness: extra.metalness ?? 0,
    ...extra,
  });
}

export const WATER = 0.42;
export const SIZE = 420;

export let CURRENT = DISTRICTS[6];
export let LANDMARKS = [];
export let ROADS = [];

export function setDistrict(id) {
  CURRENT = getDistrict(id);
  LANDMARKS = CURRENT.places.map((p) => ({
    id: p.id, name: p.name, x: p.x, z: p.z, r: p.r || 16, region: CURRENT.name, kind: p.kind,
  }));
  ROADS = roadsFor(CURRENT);
  planIslands();
  for (const isl of ISLANDS) {
    LANDMARKS.push({
      id: `island-${isl.id}`, name: isl.name, x: isl.x, z: isl.z,
      r: isl.radius * 0.8, region: CURRENT.name, kind: "island",
    });
  }
  return CURRENT;
}

/* ---------------------------------------------------------- the scenery kit */

/**
 * The owner's low-poly scenery kit (see scenery.js and scenery-data.js) as it
 * appears in each district: a hill-with-a-lake island standing in the sea just
 * off the beach, a second one further out, and — for the inland districts — a
 * massif sitting on the hillside instead. Slots are derived from the district's
 * own shape and clearance-checked against its places, so every district gets its
 * own placement and nothing moves between builds.
 *
 * `WATER` is where the game's waterline sits, so a sea island is lifted until the
 * lake in its bowl is comfortably above the sea; an inland one keeps its rim just
 * under the surrounding ground, which leaves its hill standing proud of it and
 * its lake a real pool below the trees.
 */
const ISLANDS = [];
const ISLAND_NAMES = ["Thuruthu", "Vettila Thuruthu", "Kunnu", "Mala Kunnu", "Cheru Thuruthu"];

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1)));
  return t * t * (3 - 2 * t);
}

function planIslands() {
  ISLANDS.length = 0;
  if (!KIT_SOURCE) return ISLANDS;
  const kind = CURRENT?.kind || "coastal";
  const seed = CURRENT?.seed || 0;
  const start = CURRENT?.start || { x: 0, z: 0 };
  const shore = -98 + Math.sin(start.z * 0.018 + seed) * 12;

  // Candidates, best first: the first two that fit among the district's places
  // are the ones the district gets. Sea islands sit out beyond the shore line,
  // inland ones on the rise — a highland district gets its massif on the slopes.
  const sea = (dx, dz, scale) => ({ x: shore + dx, z: start.z + dz, scale, sea: true });
  const slots = [];
  // The scale is the kit's own: at 1 kit unit = 14 m the slab is a 39 m knoll
  // with 7 m of hill on it, its hillocks are a metre across and its shore ring is
  // a few metres wide — the proportions the kit was modelled at.
  if (kind === "highland") {
    slots.push(
      { x: 116 + seed * 4, z: 26 + seed * 10, scale: 18 },
      { x: 74 + seed * 6, z: -74 - seed * 12, scale: 15 },
      sea(-36, -6, 14), sea(-80, 34, 12),
      { x: 150 - seed * 6, z: 96 + seed * 8, scale: 16 },
    );
  } else if (kind === "midland") {
    slots.push(
      { x: 96 + seed * 5, z: -70 - seed * 10, scale: 18 },
      sea(-32, 12, 14),
      { x: 130 + seed * 4, z: 60 + seed * 12, scale: 20 },
      sea(-74, -30, 12),
    );
  } else {
    // coastal and backwater: the kit's home, out in the sea
    slots.push(
      sea(-30, 10 + seed * 4, 14),
      sea(-76, -46 - seed * 8, 12),
      sea(-52, 66 + seed * 10, 13),
      sea(-108, 22 - seed * 10, 11),
    );
  }

  for (const slot of slots) {
    if (ISLANDS.length >= 2) break;
    if (Math.abs(slot.x) > 190 || Math.abs(slot.z) > 190) continue;
    const scale = slot.scale;
    const radius = KIT_INFO.outlineRadius[1] * scale * 1.16;
    let fits = true;
    for (const p of CURRENT.places) {
      if (Math.hypot(p.x - slot.x, p.z - slot.z) < radius + 16) { fits = false; break; }
    }
    if (fits) {
      for (const other of ISLANDS) {
        if (Math.hypot(other.x - slot.x, other.z - slot.z) < radius + other.radius + 8) {
          fits = false;
          break;
        }
      }
    }
    if (!fits) continue;
    const base = baseHeight(slot.x, slot.z);
    // A sea island is lifted until the lake in its bowl clears the waterline; an
    // inland one keeps its rim just under the surrounding ground, so its hill
    // stands proud of the hillside and its lake is a pool below the trees.
    const rimY = slot.sea ? WATER + -KIT_INFO.lakeZ * scale + 0.45 : base - 0.35;
    ISLANDS.push({
      id: slot.id ?? `s${ISLANDS.length}`,
      name: ISLAND_NAMES[(Math.round(seed * 10) + ISLANDS.length) % ISLAND_NAMES.length],
      x: slot.x, z: slot.z, scale, rimY, radius,
      seed: seed * 3 + ISLANDS.length * 1.7,
    });
  }
  return ISLANDS;
}

function hash(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z) {
  return noise(x, z) + 0.5 * noise(x * 2, z * 2) + 0.25 * noise(x * 4, z * 4) + 0.125 * noise(x * 8, z * 8);
}

/**
 * The district's own terrain, before the kit's islands are blended onto it:
 * coast, backwater, the inland rise, the hills. This is the ground the game had
 * before the scenery arrived, unchanged.
 */
function baseHeight(x, z) {
  const seed = CURRENT?.seed || 0;
  const kind = CURRENT?.kind || "coastal";
  const n = fbm(x * 0.012 + seed, z * 0.012);
  const n2 = fbm(x * 0.04 + 30 + seed, z * 0.04);

  if (kind === "highland") {
    let h = 6.2 + n * 4.5 + n2 * 1.8;
    if (x > 16) h += ((x - 16) / 150) * (9 + n * 7);
    const step = 2.4;
    const k = Math.floor(h / step);
    return k * step + (h - k * step) * 0.28;
  }

  const shore = -98 + (n - 0.5) * 16 + Math.sin(z * 0.018 + seed) * 12;
  const distInland = x - shore;
  const lagoonX = -50 + Math.sin(z * 0.028 + seed) * 16;
  const lagoon =
    Math.exp(-((x - lagoonX) * (x - lagoonX)) / (kind === "backwater" ? 480 : 620)) *
    (kind === "backwater" ? 0.85 : 0.45) *
    (0.5 + 0.5 * Math.abs(Math.sin(z * 0.016)));

  let hills = 0;
  const hillStart = kind === "midland" ? 36 : 48;
  if (x > hillStart) {
    const t = (x - hillStart) / 140;
    hills = t * ((kind === "midland" ? 10 : 16) + n * 14 + n2 * 7);
    const step = 2.4;
    const k = Math.floor(hills / step);
    hills = k * step + (hills - k * step) * 0.28;
  }

  const north = z > 100 ? ((z - 100) / 90) * (5 + n * 4) : 0;
  let h = 1.35 + n * 2.2 + n2 * 0.7 + hills + north;
  h -= lagoon * (kind === "backwater" ? 6.2 : 4.4);

  if (kind === "midland") {
    if (distInland < -30) h = Math.min(h, distInland * 0.08 - 0.4);
    else if (distInland < 10) {
      const t = (distInland + 30) / 40;
      h = h * t + 0.7 * (1 - t);
    }
    return h;
  }

  if (distInland < 0) h = Math.min(h, distInland * 0.14 - 1.8);
  else if (distInland < 20) {
    const t = distInland / 20;
    h = h * t + 0.55 * (1 - t);
  }
  return h;
}

/**
 * Where the kit's island is, at (x, z), and how much of its surface belongs
 * there. `kz` is the kit's own height in kit units (NaN off the slab), `top` is
 * that height in the district, and `w` is the blend weight: 0 in the island's
 * heart, 1 at the outer edge, where the district's own terrain takes over again.
 *
 * The blend is what seats the island in the land: the slab's rim is buried by the
 * terrain outside it, so there is never a seam, a step or a floating edge — the
 * hill simply rises out of the ground the way the kit's own diorama does.
 */
function islandAt(x, z) {
  for (const isl of ISLANDS) {
    const dx = x - isl.x, dz = z - isl.z;
    const r = Math.hypot(dx, dz);
    if (r >= isl.radius) continue;
    const kz = kitHeight(dx / isl.scale, dz / isl.scale);
    const top = isl.rimY + (Number.isNaN(kz) ? KIT_INFO.rimZ : kz) * isl.scale;
    return { isl, kz, top, r, w: smoothstep(0.60, 1.0, r / isl.radius) };
  }
  return null;
}

/**
 * The terrain the ground mesh is built from. Under an island it rides just below
 * the kit's slab, so the slab is always the surface you see and stand on and the
 * coarse terrain grid can never poke through it.
 */
export function groundHeightAt(x, z) {
  const base = baseHeight(x, z);
  const hit = islandAt(x, z);
  if (!hit) return base;
  return (hit.top - 0.30) * (1 - hit.w) + base * hit.w;
}

/** The height you can stand on, including the kit's islands. */
export function heightAt(x, z) {
  const hit = islandAt(x, z);
  if (!hit) return baseHeight(x, z);
  const base = baseHeight(x, z);
  const ground = (hit.top - 0.30) * (1 - hit.w) + base * hit.w;
  // on the slab the kit's own surface is the ground; off it, the blend's
  return Number.isNaN(hit.kz) ? ground : Math.max(hit.top, ground);
}

/** The lakes the kit's islands bring: swimming, fishing, boat-free water. */
export function islandLakes() {
  const out = [];
  for (const isl of ISLANDS) {
    if (!KIT_INFO.lakeZ) continue;
    out.push({
      x: isl.x, z: isl.z,
      r: Math.max(3, KIT_INFO.outlineMean * 0.40 * isl.scale),
      y: isl.rimY + KIT_INFO.lakeZ * isl.scale,
      island: isl.name,
    });
  }
  return out;
}

export function biomeAt(x, z) {
  const h = heightAt(x, z);
  const kind = CURRENT?.kind || "coastal";
  const seed = CURRENT?.seed || 0;

  // The kit's islands read as their own ground: green on the hill, and the lake
  // in the bowl below it.
  const isl = islandAt(x, z);
  if (isl && !Number.isNaN(isl.kz)) {
    const lakeY = isl.isl.rimY + KIT_INFO.lakeZ * isl.isl.scale;
    if (h <= lakeY + 0.05) return "island-lake";
    return "island";
  }

  const shore = -98 + Math.sin(z * 0.018 + seed) * 12;
  if (kind === "highland") {
    if (h > 12) return "tea";
    if (z > 80) return "forest";
    return "village";
  }
  if (h < WATER - 0.2 || (kind !== "midland" && x < shore - 2)) return "sea";
  if (kind !== "midland" && x < shore + 16 && h < 2.2) return "beach";
  if (x < -18 && h < WATER + 1.6) return "backwater";
  if (x > 70 && h > 8) return "tea";
  if (z > 110 && x > -10) return "forest";
  if (z < -40 && x > -20 && x < 70 && h < 4) return "paddy";
  return "village";
}

function distSeg(x, z, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz + 0.001)));
  return Math.hypot(x - (ax + abx * t), z - (az + abz * t));
}

export function onRoad(x, z) {
  for (const path of ROADS) {
    for (let i = 0; i < path.length - 1; i++) {
      if (distSeg(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]) < 2.8) return true;
    }
  }
  return false;
}

export function placeName(x, z) {
  let best = LANDMARKS[0], bd = 1e9;
  for (const L of LANDMARKS) {
    const d = Math.hypot(x - L.x, z - L.z);
    if (d < bd) { bd = d; best = L; }
  }
  if (best && bd < (best.r || 16) + 10) return best;
  const b = biomeAt(x, z);
  const names = {
    sea: { name: "Sea", region: CURRENT.name },
    beach: { name: "Shore", region: CURRENT.name },
    backwater: { name: "Kayal", region: CURRENT.name },
    tea: { name: "Tea", region: CURRENT.name },
    forest: { name: "Forest", region: CURRENT.name },
    paddy: { name: "Paddy", region: CURRENT.name },
    village: { name: CURRENT.name, region: "Kerala" },
  };
  return names[b] || names.village;
}

function roof(group, y, w, d, color) {
  const mat = SM(color, "tile", { roughness: 0.68, metalness: 0.04 });
  const hw = w * 0.62;
  const left = new THREE.Mesh(new THREE.BoxGeometry(hw, 0.16, d + 0.45), mat);
  left.position.set(-w * 0.22, y, 0);
  left.rotation.z = 0.52;
  group.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(hw, 0.16, d + 0.45), mat);
  right.position.set(w * 0.22, y, 0);
  right.rotation.z = -0.52;
  group.add(right);
}

function addShadow(g) {
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}

function makePalm() {
  const g = new THREE.Group();
  const bark = SM(0x8a6230, "bark", { roughness: 0.92 });
  const pts = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    pts.push(new THREE.Vector3(Math.sin(t * 0.72) * 0.62, t * 7.35 - 0.22, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const N = 16;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const t0 = i / N;
    const t1 = Math.min(1, (i + 1.12) / N);
    const a = curve.getPointAt(t0);
    const b = curve.getPointAt(t1);
    const mid = a.clone().lerp(b, 0.5);
    const h = Math.max(0.12, a.distanceTo(b));
    const r = 0.22 * (1 - t0 * 0.58);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r, h, 8), bark);
    cyl.position.copy(mid);
    const dir = b.clone().sub(a).normalize();
    cyl.quaternion.setFromUnitVectors(up, dir);
    g.add(cyl);
  }
  const tip = curve.getPointAt(1);
  const leaf = SM(0x2e9a48, "leaf", { roughness: 0.62, side: THREE.DoubleSide });
  const pg = new THREE.ConeGeometry(0.42, 3.2, 4);
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(pg, leaf);
    const a = (i / 9) * Math.PI * 2;
    f.position.set(tip.x + Math.cos(a) * 0.85, tip.y + 0.05, tip.z + Math.sin(a) * 0.85);
    f.rotation.set(1.05, a, 0);
    g.add(f);
  }
  addShadow(g);
  return g;
}

function makeBanana() {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 2.4, 6), SM(0x5a8f32, "bark", { roughness: 0.88 }));
  stem.position.y = 1.2;
  g.add(stem);
  const leaf = SM(0x2f9a3a, "leaf", { roughness: 0.62, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.6), leaf);
    const a = (i / 5) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.3, 2.4, Math.sin(a) * 0.3);
    p.rotation.set(-0.4, a, 0);
    g.add(p);
  }
  addShadow(g);
  return g;
}

function makeBroadTree(dark = false) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 3.8, 7), SM(0x6a4a28, "bark", { roughness: 0.92 }));
  trunk.position.y = 1.9;
  g.add(trunk);
  const greens = dark
    ? [0x1b5e20, 0x2e7d32, 0x145a24, 0x388e3c]
    : [0x43a047, 0x66bb6a, 0x2e7d32, 0x81c784, 0x4caf50];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1.2 + (i % 3) * 0.22, 10, 8), SM(greens[i % greens.length], "leaf", { roughness: 0.78 }));
    const a = (i / 8) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.9, 3.8 + (i % 2) * 0.65, Math.sin(a) * 0.9);
    s.scale.y = 0.78;
    g.add(s);
  }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.55, 10, 8), SM(greens[0], "leaf", { roughness: 0.78 }));
  cap.position.y = 4.7;
  cap.scale.y = 0.68;
  g.add(cap);
  addShadow(g);
  return g;
}


function makeMango() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 3.4, 7), SM(0x6b4a28, "bark", { roughness: 0.92 }));
  trunk.position.y = 1.7;
  g.add(trunk);
  const greens = [0x4d7c0f, 0x65a30d, 0x3f6212, 0x84cc16];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1.05 + (i % 3) * 0.18, 9, 7), SM(greens[i % greens.length], "leaf", { roughness: 0.76 }));
    const a = (i / 10) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.85, 3.5 + (i % 3) * 0.45, Math.sin(a) * 0.85);
    s.scale.y = 0.82;
    g.add(s);
  }
  addShadow(g);
  return g;
}

function makeJack() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 5.2, 8), SM(0x5c4030, "bark", { roughness: 0.94 }));
  trunk.position.y = 2.6;
  g.add(trunk);
  const greens = [0x166534, 0x15803d, 0x14532d];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1.45 + (i % 2) * 0.25, 9, 7), SM(greens[i % greens.length], "leaf", { roughness: 0.8 }));
    const a = (i / 7) * Math.PI * 2;
    s.position.set(Math.cos(a) * 1.05, 5.0 + (i % 2) * 0.7, Math.sin(a) * 1.05);
    s.scale.y = 0.72;
    g.add(s);
  }
  addShadow(g);
  return g;
}

function makeGulmohar() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 4.4, 6), SM(0x6a4a28, "bark", { roughness: 0.9 }));
  trunk.position.y = 2.2;
  g.add(trunk);
  const blooms = [0xea580c, 0xf97316, 0xdc2626, 0xfb923c];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.95 + (i % 3) * 0.16, 8, 6), SM(blooms[i % blooms.length], "leaf", { roughness: 0.7 }));
    const a = (i / 9) * Math.PI * 2;
    s.position.set(Math.cos(a) * 1.15, 4.3 + (i % 2) * 0.55, Math.sin(a) * 1.15);
    s.scale.y = 0.62;
    g.add(s);
  }
  addShadow(g);
  return g;
}

function makeCashew() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 2.4, 6), SM(0x7a5530, "bark", { roughness: 0.9 }));
  trunk.position.y = 1.2;
  g.add(trunk);
  const greens = [0x4ade80, 0x22c55e, 0x16a34a];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.95 + (i % 2) * 0.2, 8, 6), SM(greens[i % greens.length], "leaf", { roughness: 0.74 }));
    const a = (i / 8) * Math.PI * 2;
    s.position.set(Math.cos(a) * 1.35, 2.35 + (i % 3) * 0.28, Math.sin(a) * 1.35);
    s.scale.set(1.15, 0.55, 1.15);
    g.add(s);
  }
  addShadow(g);
  return g;
}

function makeRubber() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 7.2, 6), SM(0x8b6914, "bark", { roughness: 0.88 }));
  trunk.position.y = 3.6;
  g.add(trunk);
  const leaf = SM(0x365314, "leaf", { roughness: 0.72 });
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), leaf);
    const a = (i / 6) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.7, 7.0 + (i % 2) * 0.4, Math.sin(a) * 0.7);
    s.scale.y = 0.7;
    g.add(s);
  }
  addShadow(g);
  return g;
}

function makeBanyan() {
  const g = new THREE.Group();
  const bark = SM(0x5a4030, "bark", { roughness: 0.94 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 3.6, 8), bark);
  trunk.position.y = 1.8;
  g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 5), bark);
    r.position.set(Math.cos(a) * 1.4, 1.6, Math.sin(a) * 1.4);
    g.add(r);
  }
  const greens = [0x166534, 0x3f6212, 0x14532d];
  for (let i = 0; i < 11; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1.3 + (i % 3) * 0.2, 8, 6), SM(greens[i % greens.length], "leaf", { roughness: 0.8 }));
    const a = (i / 11) * Math.PI * 2;
    s.position.set(Math.cos(a) * 1.7, 3.9 + (i % 2) * 0.5, Math.sin(a) * 1.7);
    s.scale.y = 0.58;
    g.add(s);
  }
  addShadow(g);
  return g;
}

function makeTeak() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.4, 6.0, 7), SM(0x7a5428, "bark", { roughness: 0.9 }));
  trunk.position.y = 3.0;
  g.add(trunk);
  const greens = [0x4d7c0f, 0x3f6212, 0x65a30d];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1.35, 9, 6), SM(greens[i % greens.length], "leaf", { roughness: 0.78 }));
    s.position.set((i % 2 ? 0.4 : -0.35), 4.6 + i * 0.55, (i % 3 - 1) * 0.35);
    s.scale.set(1.15, 0.45, 1.15);
    g.add(s);
  }
  addShadow(g);
  return g;
}

function chineseNet(root, x, z, rot = 0) {
  const g = new THREE.Group();
  const wood = SM(0x6b4a2a, "wood", { roughness: 0.82 });
  const pole = new THREE.CylinderGeometry(0.08, 0.1, 14, 5);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(pole, wood);
    p.position.set(s * 1.2, 5, 0);
    p.rotation.z = s * 0.35;
    g.add(p);
  }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 12), wood);
  arm.position.set(0, 10.5, -3);
  arm.rotation.x = 0.45;
  g.add(arm);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(6, 6, 6, 6), new THREE.MeshLambertMaterial({ color: 0x9aa7a0, wireframe: true, transparent: true, opacity: 0.55 }));
  net.rotation.x = -Math.PI / 2;
  net.position.set(0, 1.2, -8);
  g.add(net);
  g.position.set(x, Math.max(heightAt(x, z), WATER) - 0.2, z);
  g.rotation.y = rot;
  root.add(g);
}

function houseboat(root, x, z, rot = 0) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 10), SM(0xc8b48a, "wood", { roughness: 0.78 }));
  hull.position.y = 0.2;
  g.add(hull);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 6.5), SM(0xf0e6d2, "plaster", { roughness: 0.84 }));
  cabin.position.y = 1.35;
  g.add(cabin);
  roof(g, 2.35, 3.0, 7.2, 0x6b5335);
  g.position.set(x, WATER + 0.15, z);
  g.rotation.y = rot;
  root.add(g);
  return g;
}

function temple(root, x, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 8), SM(0xe8d9b8, "laterite", { roughness: 0.88 }));
  base.position.y = 0.5;
  g.add(base);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.2, 5.2), SM(0xf3ead3, "plaster", { roughness: 0.84 }));
  hall.position.y = 2.6;
  g.add(hall);
  const copper = SM(0xb87333, "tile", { roughness: 0.45, metalness: 0.35 });
  for (let i = 0; i < 3; i++) {
    const py = new THREE.Mesh(new THREE.ConeGeometry(3.2 - i * 0.7, 1.6, 4), copper);
    py.position.y = 4.6 + i * 1.15;
    py.rotation.y = Math.PI / 4;
    g.add(py);
  }
  g.position.set(x, heightAt(x, z), z);
  addShadow(g);
  root.add(g);
  return { type: "box", x, z, hw: 4.3, hd: 4.3, rot: 0 };
}

function church(root, x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 9), SM(0xf7f1e4, "plaster", { roughness: 0.84 }));
  body.position.y = 1.6;
  g.add(body);
  const steeple = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.2, 1.4), SM(0xf7f1e4, "plaster", { roughness: 0.84 }));
  steeple.position.set(0, 5.4, 4.2);
  g.add(steeple);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 4), SM(0x8b1e1e, "tile", { roughness: 0.7 }));
  cap.position.set(0, 8.4, 4.2);
  g.add(cap);
  roof(g, 3.4, 6.4, 9, 0x8b1e1e);
  g.position.set(x, heightAt(x, z), z);
  addShadow(g);
  root.add(g);
  return { type: "box", x, z, hw: 3.4, hd: 4.9, rot: 0 };
}

function mosque(root, x, z) {
  const g = new THREE.Group();
  const cream = SM(0xf4efe4, "plaster", { roughness: 0.84 });
  const hall = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.2, 7.2), cream);
  hall.position.y = 1.6;
  g.add(hall);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.85, 10, 8), SM(0xd4c48a, "plaster", { roughness: 0.55 }));
  dome.position.y = 4.15;
  g.add(dome);
  const min = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 7.2, 8), cream);
  min.position.set(2.7, 3.6, 2.9);
  g.add(min);
  g.position.set(x, heightAt(x, z), z);
  addShadow(g);
  root.add(g);
  return { type: "box", x, z, hw: 3.4, hd: 3.9, rot: 0 };
}

function lighthouse(root, x, z) {
  const g = new THREE.Group();
  const y = Math.max(heightAt(x, z), WATER + 1);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.9, 16, 10), SM(0xf2efe8, "plaster", { roughness: 0.84 }));
  body.position.y = 8;
  g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.7, 2.2, 10), SM(0xb42318, "plaster", { roughness: 0.8 }));
  band.position.y = 11;
  g.add(band);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.6, 10), new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffcc66, emissiveIntensity: 0.6 }));
  lamp.position.y = 16.6;
  g.add(lamp);
  g.position.set(x, y, z);
  root.add(g);
  return { x, z, r: 3.6, topY: y + 17 };
}

function makeFort(root, x, z, colliders) {
  const y = heightAt(x, z);
  const mat = SM(0xb45a32, "laterite", { roughness: 0.9 });
  const wall = (wx, wz, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), mat);
    m.position.set(wx, y + 1.2, wz);
    root.add(m);
  };
  wall(x, z - 7, 16, 0.7);
  wall(x, z + 7, 16, 0.7);
  wall(x - 7.6, z, 0.7, 14);
  wall(x + 7.6, z, 0.7, 14);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.4, 1.1), mat);
  gate.position.set(x, y + 1.7, z + 7);
  root.add(gate);
  colliders.push({ type: "box", x, z: z - 7, hw: 8.2, hd: 0.5, rot: 0 });
  colliders.push({ type: "box", x: x - 4.6, z: z + 7, hw: 3.4, hd: 0.5, rot: 0 });
  colliders.push({ type: "box", x: x + 4.6, z: z + 7, hw: 3.4, hd: 0.5, rot: 0 });
  colliders.push({ type: "box", x: x - 7.6, z, hw: 0.5, hd: 7.2, rot: 0 });
  colliders.push({ type: "box", x: x + 7.6, z, hw: 0.5, hd: 7.2, rot: 0 });
}

function makeHotel(root, x, z, colliders) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 4.4, 6.2), SM(0xece4d4, "plaster", { roughness: 0.86 }));
  body.position.y = 2.2;
  g.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.18, 6.4), new THREE.MeshLambertMaterial({ color: 0xc45c26 }));
  band.position.y = 4.45;
  g.add(band);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.55, 0.08), new THREE.MeshLambertMaterial({ color: 0x1a4a7a }));
  sign.position.set(0, 3.4, 3.18);
  g.add(sign);
  for (const s of [-3.2, 0, 3.2]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.08), new THREE.MeshLambertMaterial({ color: 0x7eafc4 }));
    w.position.set(s, 2.6, 3.16);
    g.add(w);
  }
  g.position.set(x, y, z);
  addShadow(g);
  root.add(g);
  colliders.push({ type: "box", x, z, hw: 5.3, hd: 3.4, rot: 0 });
}

function makeChaya(root, x, z, colliders) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  const tin = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 3.4), new THREE.MeshLambertMaterial({ color: 0x3d8a4a }));
  tin.position.y = 2.35;
  tin.rotation.z = 0.08;
  g.add(tin);
  for (const s of [-1.8, 1.8]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.3, 5), SM(0x6b4a28, "wood", { roughness: 0.82 }));
    p.position.set(s, 1.15, 1.4);
    g.add(p);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.32, 0.5), SM(0x6b4a28, "wood", { roughness: 0.82 }));
  bench.position.set(0, 0.4, 0.4);
  g.add(bench);
  const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 8), new THREE.MeshLambertMaterial({ color: 0xc45c26 }));
  kettle.position.set(0.6, 0.72, 0.2);
  g.add(kettle);
  g.position.set(x, y, z);
  addShadow(g);
  root.add(g);
  colliders.push({ type: "box", x, z, hw: 2.1, hd: 1.5, rot: 0 });
}

function makeThattu(root, x, z, colliders) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  const cart = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 1.6), SM(0x6b4a28, "wood", { roughness: 0.82 }));
  cart.position.y = 0.7;
  g.add(cart);
  const tarp = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 1.8), new THREE.MeshLambertMaterial({ color: 0xc41e3a }));
  tarp.position.y = 2.05;
  g.add(tarp);
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 10), new THREE.MeshLambertMaterial({ color: 0x333 }));
  pan.position.set(0, 1.12, 0);
  g.add(pan);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshLambertMaterial({ color: 0xffe2a0, emissive: 0xffc14d, emissiveIntensity: 0.7 }));
  lamp.position.set(0.9, 1.5, 0);
  g.add(lamp);
  g.position.set(x, y, z);
  addShadow(g);
  root.add(g);
  colliders.push({ type: "box", x, z, hw: 1.4, hd: 0.9, rot: 0 });
}

function makePond(root, x, z, r = 4.4) {
  const y = heightAt(x, z);
  const T = shared();
  const bank = new THREE.Mesh(
    new THREE.RingGeometry(r - 0.15, r + 0.55, 36),
    new THREE.MeshLambertMaterial({ color: 0xe8d4a8 })
  );
  bank.rotation.x = -Math.PI / 2;
  bank.position.set(x, y + 0.07, z);
  root.add(bank);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(r - 0.12, 36),
    new THREE.MeshLambertMaterial({ map: T.pond, color: 0xffffff })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(x, y + 0.1, z);
  root.add(pool);
  return { x, z, r: r + 0.6, y: y + 0.1 };
}

function makePeak(root, x, z, colliders) {
  const y = heightAt(x, z);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(4.2, 7.5, 5), new THREE.MeshLambertMaterial({ color: 0x6a6a58 }));
  rock.position.set(x, y + 3.6, z);
  root.add(rock);
  colliders.push({ x, z, r: 3.4 });
}

function makeDam(root, x, z, colliders) {
  const y = heightAt(x, z);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(18, 5.5, 1.4), new THREE.MeshLambertMaterial({ color: 0x9aa09a }));
  wall.position.set(x, y + 2.6, z);
  root.add(wall);
  colliders.push({ type: "box", x, z, hw: 9.2, hd: 0.9, rot: 0 });
}

function makeCave(root, x, z, colliders) {
  const y = heightAt(x, z);
  const rockM = new THREE.MeshLambertMaterial({ color: 0x8a8474 });
  for (const s of [-2.2, 2.2]) {
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), rockM);
    rk.position.set(x + s, y + 1.6, z);
    root.add(rk);
    colliders.push({ x: x + s, z, r: 1.9 });
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 2.4), rockM);
  lintel.position.set(x, y + 3.4, z);
  root.add(lintel);
}

function canoe() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 3.4), SM(0x6b4a28, "wood", { roughness: 0.82 }));
  hull.position.y = 0.1;
  g.add(hull);
  return g;
}

function pier(root, x, z, len = 18, rot = 0) {
  const g = new THREE.Group();
  const wood = SM(0x6e5230, "wood", { roughness: 0.82 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, len), wood);
  deck.position.y = WATER + 0.55;
  g.add(deck);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  root.add(g);
  return { x, z, w: 4, l: len, y: WATER + 0.7, rot };
}

function lampPost(root, x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 5), new THREE.MeshLambertMaterial({ color: 0x2a2a28 }));
  pole.position.y = 1.6;
  g.add(pole);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshLambertMaterial({ color: 0xffe2a0, emissive: 0xffc14d, emissiveIntensity: 0.8 }));
  bulb.position.y = 3.25;
  g.add(bulb);
  const y = Math.max(heightAt(x, z), WATER);
  g.position.set(x, y, z);
  root.add(g);
  const light = new THREE.PointLight(0xffc878, 0.0, 14, 2);
  light.position.set(x, y + 3.3, z);
  root.add(light);
  return light;
}

function placeBridge(root, docks, x, z, len, rot) {
  const y = WATER + 1.18;
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, len), SM(0x8a7a62, "laterite", { roughness: 0.88 }));
  deck.position.y = y;
  g.add(deck);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  root.add(g);
  docks.push({ x, z, w: 5.2, l: len, y: y + 0.14, rot });
}

function ksebPole(root, x, z) {
  const y = Math.max(heightAt(x, z), WATER);
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 6.4, 5), new THREE.MeshLambertMaterial({ color: 0xc8b090 }));
  p.position.set(x, y + 3.2, z);
  root.add(p);
}

function stalls(root, x, z, colliders) {
  const stallM = [0xc41e3a, 0xf0a202, 0x2aa8a0, 0x7a2038];
  const wood = SM(0x6b4a28, "wood", { roughness: 0.82 });
  for (let i = 0; i < 4; i++) {
    const sx = x + i * 3.2, sz = z;
    const y = heightAt(sx, sz);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 2.2), new THREE.MeshLambertMaterial({ color: stallM[i] }));
    cloth.position.set(sx, y + 2.05, sz);
    root.add(cloth);
    for (const s of [-1.05, 1.05]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.1, 5), wood);
      pole.position.set(sx + s, y + 1.05, sz + 0.9);
      root.add(pole);
    }
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.1), wood);
    crate.position.set(sx, y + 0.4, sz);
    root.add(crate);
    if (colliders) colliders.push({ type: "box", x: sx, z: sz, hw: 1.15, hd: 0.85, rot: 0 });
  }
}

function paddyPatch(root, x, z) {
  const paddyMat = new THREE.MeshLambertMaterial({ color: 0x6fa83c });
  const waterPaddy = new THREE.MeshLambertMaterial({ color: 0x4a9aaa, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 6; i++) {
    const px = x + (i % 3) * 12;
    const pz = z - Math.floor(i / 3) * 12;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(10, 9), paddyMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(px, heightAt(px, pz) + 0.04, pz);
    root.add(p);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), waterPaddy);
    w.rotation.x = -Math.PI / 2;
    w.position.set(px, heightAt(px, pz) + 0.06, pz);
    root.add(w);
  }
}

function padRing(root, x, z, color) {
  const y = heightAt(x, z);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.05, 1.38, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y + 0.09, z);
  root.add(ring);
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.set(x, y + 0.07, z);
  root.add(fill);
}

function addShop(root, shops, kind, title, x, z) {
  padRing(root, x, z, kind === "hotel" ? 0xc45c26 : 0xf5c400);
  shops.push({ kind, title, x, z, r: 1.7 });
}

function addJob(root, jobs, id, x, z) {
  padRing(root, x, z, 0x3b82f6);
  jobs.push({ id, x, z, r: 1.7 });
}

function sandBeach(root, x, z) {
  const sandM = new THREE.MeshLambertMaterial({ color: 0xf6e4b4 });
  for (let i = 0; i < 4; i++) {
    const zz = z - 12 + i * 10;
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), sandM);
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(x, Math.max(heightAt(x, zz), WATER) + 0.04, zz);
    root.add(sand);
  }
}

const waterVert = `
uniform float uTime;
varying vec3 vW;
varying vec3 vN;
varying float vH;
float wv(vec2 p, float t, float amp, float freq, vec2 dir, float sp){
  return sin(dot(p, dir)*freq + t*sp) * amp;
}
void main(){
  vec3 p = position;
  vec2 xz = p.xz;
  float t = uTime;
  vec2 d1 = normalize(vec2(1.0, 0.38));
  vec2 d2 = normalize(vec2(-0.45, 1.0));
  vec2 d3 = normalize(vec2(0.72, 0.68));
  vec2 d4 = normalize(vec2(-0.85, 0.22));
  float h = 0.0;
  h += wv(xz, t, 0.11, 0.11, d1, 1.15);
  h += wv(xz, t, 0.055, 0.27, d2, 1.7);
  h += wv(xz, t, 0.028, 0.62, d3, 2.35);
  h += wv(xz, t, 0.012, 1.55, d4, 3.4);
  p.y += h;
  vH = h;
  float e = 0.4;
  float hx = wv(xz+vec2(e,0.0), t, 0.11, 0.11, d1, 1.15) + wv(xz+vec2(e,0.0), t, 0.055, 0.27, d2, 1.7);
  float hz = wv(xz+vec2(0.0,e), t, 0.11, 0.11, d1, 1.15) + wv(xz+vec2(0.0,e), t, 0.055, 0.27, d2, 1.7);
  vec3 n = normalize(vec3((h - hx)/e, 1.0, (h - hz)/e));
  vN = normalize(mat3(modelMatrix) * n);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const waterFrag = `
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uPlayer;
varying vec3 vW;
varying vec3 vN;
varying float vH;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(uSun);
  vec3 deep = vec3(0.015, 0.16, 0.26);
  vec3 mid = vec3(0.03, 0.38, 0.48);
  vec3 shoal = vec3(0.14, 0.58, 0.55);
  float west = smoothstep(-40.0, 30.0, vW.x);
  vec3 col = mix(deep, mix(mid, shoal, 0.5), west);
  float cau = sin(vW.x*0.42 + uTime*1.4) * sin(vW.z*0.38 + uTime*1.05);
  col += vec3(0.03, 0.08, 0.07) * cau * 0.45;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.4);
  vec3 sky = vec3(0.58, 0.80, 0.94);
  col = mix(col, sky, fres * 0.78);
  vec3 R = reflect(-L, N);
  float spec = pow(max(dot(R, V), 0.0), 96.0);
  col += vec3(1.0, 0.97, 0.88) * spec * 1.05;
  float foam = smoothstep(0.07, 0.14, vH);
  col = mix(col, vec3(0.90, 0.96, 0.98), foam * 0.55);
  float pd = length(vW.xz - uPlayer.xz);
  float wake = (1.0 - smoothstep(0.3, 5.5, pd)) * 0.35;
  col = mix(col, vec3(0.82, 0.94, 0.96), wake);
  float alpha = mix(0.82, 0.96, fres);
  gl_FragColor = vec4(col, alpha);
}`;

export function disposeWorld(world) {
  if (!world?.root) return;
  world.root.removeFromParent();
  world.root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m) continue;
        if (m.map && m.map.userData?.shared) continue;
        m.dispose?.();
      }
    }
  });
}

export function buildWorld(scene, opts = {}) {
  const lite = !!opts.lite;
  const colliders = [];
  const docks = [];
  const nightLights = [];
  const fishSpots = [];
  const root = new THREE.Group();
  root.name = "district";
  scene.add(root);

  const shops = [];
  const jobs = [];
  const sway = [];
  const extras = { root, nets: [], boats: [], rain: null, water: null, sun: null, hemi: null, lamp: null, fishSpots, shops, jobs, sway, islands: [] };

  const hemi = new THREE.HemisphereLight(0xfff4dc, 0xa8c85a, 1.45);
  root.add(hemi);
  extras.hemi = hemi;
  const sun = new THREE.DirectionalLight(0xffe6b0, 1.85);
  sun.position.set(70, 110, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320;
  sun.shadow.camera.left = -120;
  sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120;
  sun.shadow.camera.bottom = -120;
  root.add(sun);
  extras.sun = sun;
  extras.lamp = new THREE.AmbientLight(0xfff6e8, 0.45);
  root.add(extras.lamp);
  const fill = new THREE.DirectionalLight(0x88b8ff, 0.35);
  fill.position.set(-40, 30, -60);
  root.add(fill);

  extras.sky = null;
  scene.fog = new THREE.Fog(0xd2e6c8, 90, 240);
  scene.background = new THREE.Color(0xc8e4f2);

  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfffaf2, transparent: true, opacity: 0.88 });
  const clouds = new THREE.Group();
  for (let i = 0; i < (lite ? 8 : 16); i++) {
    const cg = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(4 + hash(i, k) * 5, 8, 6), cloudMat);
      s.position.set((hash(k, i) - 0.5) * 12, hash(i + 3, k) * 2, (hash(k + 2, i) - 0.5) * 6);
      s.scale.y = 0.42;
      cg.add(s);
    }
    cg.position.set(-160 + hash(i, 9) * 320, 48 + hash(i, 10) * 18, -160 + hash(i, 11) * 320);
    clouds.add(cg);
  }
  root.add(clouds);
  extras.clouds = clouds;

  const SEG = lite ? 56 : 72;
  let geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const p0 = geo.attributes.position;
  // Under an island the mesh rides below the kit's own slab (groundHeightAt), so
  // the slab is what you see; everywhere else this is the same ground as before.
  for (let i = 0; i < p0.count; i++) p0.setY(i, groundHeightAt(p0.getX(i), p0.getZ(i)));
  geo = geo.toNonIndexed();
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const h = heightAt(x, z);
    const b = biomeAt(x, z);
    if (b === "sea") c.set(0xa8d060);
    else if (b === "beach") c.set(0xf2e4b8);
    else if (b === "backwater") c.set(0xb4d85c);
    else if (b === "tea") c.set(0x9ec848);
    else if (b === "forest") c.set(0x86b844);
    else if (b === "paddy") c.set(0xd0e46a);
    else if (b === "island") c.set(0x9ec848);
    else if (b === "island-lake") c.set(0x7fb0a8);
    else c.set(0xc2dc5e);
    const v = (hash(Math.floor(x * 0.22 + z * 0.07), Math.floor(z * 0.22)) - 0.5);
    c.offsetHSL(v * 0.015, v * 0.04, v * 0.045);
    if (h < WATER + 0.25 && b !== "sea") c.lerp(new THREE.Color(0xd4c48a), 0.25);
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = c.r;
      colors[(i + k) * 3 + 1] = c.g;
      colors[(i + k) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  ground.receiveShadow = true;
  root.add(ground);

  /* ---- the owner's scenery kit -------------------------------------------
   * The islands: the kit's slab of land, its lake, and its rocks and conifers
   * standing on it — the whole diorama, seated in the district's terrain by the
   * blend in heightAt(). Its lakes join fishSpots, so the fishing and swimming
   * the game already has work on them. */
  for (const spec of ISLANDS) {
    const built = kitIsland(spec, { lite });
    root.add(built.root);
    extras.islands.push(built);
    for (const c2 of built.colliders) colliders.push(c2);
    for (const m of built.sway) sway.push(m);
    if (built.lakeSpot) {
      built.lakeSpot.name = spec.name;
      fishSpots.push(built.lakeSpot);
    }
  }

  /* ---- and the kit's own rocks and conifers, on the district's ground too:
   * the same shapes the island is dressed with, scattered where the ground
   * suits them — boulders on the banks and the hillsides, conifers in stands
   * above the village, never in the water, never on a road, never in a lake. */
  {
    const { rocks, trees } = kitProps();
    const dummy = new THREE.Object3D();
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const wantRocks = lite ? 54 : 110;
    const perRock = Math.ceil(wantRocks / rocks.length) + 2;
    const rockMeshes = rocks.map((r) => {
      const im = new THREE.InstancedMesh(r.geo, rockMat, perRock);
      im.castShadow = true;
      im.receiveShadow = true;
      im.count = 0;
      root.add(im);
      return im;
    });
    let placedRocks = 0;
    for (let i = 0; i < wantRocks * 6 && placedRocks < wantRocks; i++) {
      const x = -170 + hash(i, 41) * 340;
      const z = -170 + hash(i, 42) * 340;
      const b = biomeAt(x, z);
      if (b === "island" || b === "island-lake" || b === "sea") continue;
      const h = heightAt(x, z);
      if (h < WATER - 0.4 || h > 34) continue;
      if (onRoad(x, z)) continue;
      if (CURRENT.places.some((pl) => (pl.kind === "pond" || pl.kind === "lake") &&
        Math.hypot(x - pl.x, z - pl.z) < 9)) continue;
      const shape = Math.floor(hash(i, 43) * rocks.length) % rocks.length;
      const im = rockMeshes[shape];
      if (im.count >= perRock) continue;
      const size = 0.5 + hash(i, 44) * 1.9;
      dummy.position.set(x, h - size * 0.16, z);
      dummy.rotation.set(0, hash(i, 45) * 6.283, 0);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      im.setMatrixAt(im.count++, dummy.matrix);
      if (size > 1.1) colliders.push({ x, z, r: size * 0.42 });
      placedRocks++;
    }
    for (const im of rockMeshes) im.instanceMatrix.needsUpdate = true;

    const wantTrees = lite ? 10 : 22;
    const perTree = Math.ceil(wantTrees / trees.length) + 2;
    const treeMeshes = trees.map((t) => {
      const im = new THREE.InstancedMesh(t.geo, treeMat, perTree);
      im.castShadow = true;
      im.receiveShadow = true;
      im.count = 0;
      root.add(im);
      return im;
    });
    let placedTrees = 0;
    for (let i = 0; i < wantTrees * 10 && placedTrees < wantTrees; i++) {
      const x = -150 + hash(i, 51) * 300;
      const z = -150 + hash(i, 52) * 300;
      const b = biomeAt(x, z);
      if (b === "sea" || b === "beach" || b === "island" || b === "island-lake") continue;
      const h = heightAt(x, z);
      if (h < WATER + 1.4) continue;
      const dx = heightAt(x + 1.2, z) - heightAt(x - 1.2, z);
      const dz = heightAt(x, z + 1.2) - heightAt(x, z - 1.2);
      if (Math.hypot(dx, dz) / 2.4 > 0.5) continue;            // too steep to stand
      if (onRoad(x, z)) continue;
      const shape = Math.floor(hash(i, 53) * trees.length) % trees.length;
      const im = treeMeshes[shape];
      if (im.count >= perTree) continue;
      const size = 5.5 + hash(i, 54) * 5;                      // metres
      dummy.position.set(x, h - 0.25, z);
      dummy.rotation.set(0, hash(i, 55) * 6.283, 0);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      im.setMatrixAt(im.count++, dummy.matrix);
      colliders.push({ x, z, r: Math.max(0.5, size * 0.05) });
      placedTrees++;
    }
    for (const im of treeMeshes) im.instanceMatrix.needsUpdate = true;
    extras.rocks = rockMeshes;
    extras.conifers = treeMeshes;
  }

  extras.uTime = { value: 0 };
  extras.uPlayer = { value: new THREE.Vector3() };
  extras.uWind = { value: 1 };

  const kind = CURRENT.kind;
  extras.water = null;

  const palmProto = makePalm();
  const bananaProto = makeBanana();
  const treeProto = makeBroadTree(false);
  const darkProto = makeBroadTree(true);
  const mangoProto = makeMango();
  const jackProto = makeJack();
  const gulmoharProto = makeGulmohar();
  const cashewProto = makeCashew();
  const rubberProto = makeRubber();
  const banyanProto = makeBanyan();
  const teakProto = makeTeak();

  const placeTree = (proto, x, z, s = 1, rad = 0.55) => {
    const y = heightAt(x, z);
    if (y < WATER + 0.35) return false;
    const tb = biomeAt(x, z);
    if (tb === "island" || tb === "island-lake") return false;   // the kit's islands have their own trees
    for (const pl of CURRENT.places) {
      if ((pl.kind === "pond" || pl.kind === "lake") && Math.hypot(x - pl.x, z - pl.z) < 6.2) return false;
    }
    const dx = heightAt(x + 1.15, z) - heightAt(x - 1.15, z);
    const dz = heightAt(x, z + 1.15) - heightAt(x, z - 1.15);
    if (Math.hypot(dx, dz) / 2.3 > 0.52) return false;
    const sc = s * (0.85 + hash(z, x) * 0.28);
    const m = proto.clone();
    m.position.set(x, y - 0.18, z);
    m.rotation.y = hash(x, z) * 6.2;
    m.scale.setScalar(sc);
    m.userData.wind = { ph: hash(x, z) * 6.2, spd: 0.55 + hash(z, x) * 0.7, amp: 0.028 + sc * 0.018, yaw: m.rotation.y };
    sway.push(m);
    root.add(m);
    if (rad > 0) colliders.push({ x, z, r: rad * sc });
    return true;
  };

  if (kind === "coastal" || kind === "backwater") {
    for (let z = -160; z < 90; z += lite ? 12 : 9) {
      const shore = -98 + Math.sin(z * 0.018) * 12;
      placeTree(palmProto, shore + 5 + hash(z, 3) * 4, z, 1.15 + hash(z, 4) * 0.25, 0.55);
    }
  }

  const forestN = lite ? 18 : 32;
  const forestMix = [darkProto, teakProto, rubberProto, banyanProto, jackProto];
  for (let i = 0; i < forestN; i++) {
    const x = 24 + hash(i, 11) * 80;
    const z = 100 + hash(i, 12) * 70;
    const proto = forestMix[i % forestMix.length];
    placeTree(proto, x, z, 1.05 + hash(i, 13) * 0.45, proto === rubberProto ? 0.4 : 0.75);
  }
  for (const p of CURRENT.places.filter((pl) => pl.kind === "chaya" || pl.kind === "thattukada")) {
    for (let k = 0; k < 3; k++) placeTree(bananaProto, p.x + (k - 1) * 1.5, p.z + 3 + (k % 2), 0.95, 0.22);
  }
  const villageMix = [treeProto, mangoProto, jackProto, gulmoharProto, cashewProto, banyanProto, teakProto, bananaProto];
  const mixN = lite ? 72 : 150;
  let planted = 0;
  for (let i = 0; i < mixN * 8 && planted < mixN; i++) {
    const x = -100 + hash(i, 30) * 220;
    const z = -140 + hash(i, 31) * 280;
    const b = biomeAt(x, z);
    if (b === "sea" || b === "beach") continue;
    const proto = b === "forest"
      ? forestMix[Math.floor(hash(i, 32) * forestMix.length)]
      : villageMix[Math.floor(hash(i, 33) * villageMix.length)];
    const rad = proto === bananaProto ? 0.22 : proto === rubberProto ? 0.38 : 0.68;
    if (placeTree(proto, x, z, 0.88 + hash(i, 34) * 0.5, rad)) planted++;
  }

  const wantTea = kind === "highland" || CURRENT.places.some((p) => p.kind === "tea");
  if (wantTea) {
    const teaGeo = new THREE.SphereGeometry(0.7, 6, 4);
    teaGeo.scale(1.3, 0.55, 1.1);
    const teaMat = new THREE.MeshLambertMaterial({ color: 0x3d8c28 });
    const teaCount = lite ? 160 : 360;
    const tea = new THREE.InstancedMesh(teaGeo, teaMat, teaCount);
    tea.castShadow = true;
    const dummyT = new THREE.Object3D();
    let placed = 0;
    for (let i = 0; i < 2000 && placed < teaCount; i++) {
      const x = 50 + hash(i, 40) * 130;
      const z = -120 + hash(i, 41) * 160;
      const h = heightAt(x, z);
      if (kind === "highland" ? h < 8 : h < 7) continue;
      dummyT.position.set(x, h + 0.25, z);
      dummyT.rotation.y = hash(i, 42) * 6;
      dummyT.scale.setScalar(0.7 + hash(i, 43) * 0.6);
      dummyT.updateMatrix();
      tea.setMatrixAt(placed++, dummyT.matrix);
    }
    tea.count = placed;
    root.add(tea);
  }

  const grassGeo = new THREE.ConeGeometry(0.09, 0.52, 4);
  grassGeo.translate(0, 0.26, 0);
  const grassMat = new THREE.MeshLambertMaterial({ color: 0xa8d44a, flatShading: true, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = extras.uTime;
    shader.uniforms.uPlayer = extras.uPlayer;
    shader.uniforms.uWind = extras.uWind;
    shader.vertexShader = `
      uniform float uTime;
      uniform vec3 uPlayer;
      uniform float uWind;
    ` + shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float wv = uWind * position.y;
       transformed.x += sin(uTime * 1.55 + position.y * 3.2) * 0.34 * wv;
       transformed.z += cos(uTime * 1.12 + position.x * 0.4) * 0.22 * wv;`
    ).replace(
      "#include <project_vertex>",
      `vec4 worldPos = vec4(transformed, 1.0);
       #ifdef USE_INSTANCING
         worldPos = instanceMatrix * worldPos;
       #endif
       worldPos = modelMatrix * worldPos;
       vec2 gd = worldPos.xz - uPlayer.xz;
       float gdist = length(gd);
       float ght = max(position.y, 0.0);
       float gpush = (1.0 - smoothstep(0.12, 2.5, gdist)) * 0.95 * ght;
       if (gdist > 0.001) {
         worldPos.x += (gd.x / gdist) * gpush;
         worldPos.z += (gd.y / gdist) * gpush;
       }
       vec4 mvPosition = viewMatrix * worldPos;
       gl_Position = projectionMatrix * mvPosition;`
    );
  };
  const patches = lite ? 90 : 160;
  const per = lite ? 55 : 95;
  const GR = patches * per;
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, GR);
  grass.frustumCulled = false;
  const dummy = new THREE.Object3D();
  let gi = 0;
  for (let p = 0; p < patches && gi < GR; p++) {
    const cx = -90 + hash(p, 70) * 210;
    const cz = -120 + hash(p, 71) * 250;
    const ch = heightAt(cx, cz);
    const cb = biomeAt(cx, cz);
    if (ch < WATER + 0.55 || cb === "sea" || cb === "beach") continue;
    if (CURRENT.places.some((pl) => (pl.kind === "pond" || pl.kind === "lake") && Math.hypot(cx - pl.x, cz - pl.z) < 7)) continue;
    const rad = 1.1 + hash(p, 76) * 2.8;
    const nHere = Math.floor(per * (0.55 + hash(p, 77) * 0.7));
    for (let k = 0; k < nHere && gi < GR; k++) {
      const a = hash(p * 80 + k, 72) * 6.2832;
      const r = Math.sqrt(hash(p * 80 + k, 73)) * rad;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const h = heightAt(x, z);
      if (h < WATER + 0.5) continue;
      dummy.position.set(x, h, z);
      dummy.rotation.y = hash(p * 80 + k, 74) * 6.2;
      dummy.rotation.z = (hash(p * 80 + k, 78) - 0.5) * 0.25;
      const sc = 0.7 + hash(p * 80 + k, 75) * 1.15;
      dummy.scale.set(sc * 0.85, sc * (0.9 + hash(k, 79) * 0.8), sc * 0.85);
      dummy.updateMatrix();
      grass.setMatrixAt(gi++, dummy.matrix);
    }
  }
  grass.count = gi;
  root.add(grass);
  extras.grass = grass;

  for (const p of CURRENT.places) {
    const { kind: k, x, z } = p;
    if (k === "temple") {
      colliders.push(temple(root, x, z));
      addJob(root, jobs, "temple", x + 6.5, z + 2);
    } else if (k === "church") colliders.push(church(root, x, z));
    else if (k === "mosque") colliders.push(mosque(root, x, z));
    else if (k === "lighthouse") {
      const L = lighthouse(root, x, z);
      colliders.push(L);
      extras.lighthouseTop = L.topY;
      extras.lighthouse = { x, z };
    } else if (k === "fort") {
      makeFort(root, x, z, colliders);
      addJob(root, jobs, "guide", x, z + 10.5);
    } else if (k === "hotel") {
      makeHotel(root, x, z, colliders);
      addShop(root, shops, "hotel", "Lodge", x, z + 5.4);
      addJob(root, jobs, "waiter", x + 7.2, z + 2);
    } else if (k === "chaya") {
      makeChaya(root, x, z, colliders);
      addShop(root, shops, "chaya", "Chaya Kada", x, z + 3.4);
      addJob(root, jobs, "tea", x - 3.6, z + 2);
    } else if (k === "thattukada") {
      makeThattu(root, x, z, colliders);
      addShop(root, shops, "thattukada", "Thattukada", x, z + 2.8);
      addJob(root, jobs, "cook", x + 3.2, z + 1.6);
    } else if (k === "pond" || k === "lake") {
      fishSpots.push(makePond(root, x, z, 4.4));
      addJob(root, jobs, "fisher", x + 5.6, z);
    } else if (k === "peak") makePeak(root, x, z, colliders);
    else if (k === "dam") {
      makeDam(root, x, z, colliders);
      addJob(root, jobs, "dam", x, z + 4.2);
    } else if (k === "cave") makeCave(root, x, z, colliders);
    else if (k === "jetty") { /* land only */ }
    else if (k === "nets") { /* land only */ }
    else if (k === "houseboat") { /* land only */ }
    else if (k === "beach" || k === "drivein") {
      sandBeach(root, x, z);
      addJob(root, jobs, "cleaner", x + 8, z);
    } else if (k === "market") {
      stalls(root, x, z, colliders);
      addShop(root, shops, "market", "Market", x + 4.8, z + 3.4);
      addJob(root, jobs, "vendor", x - 3, z + 3.2);
    } else if (k === "paddy") paddyPatch(root, x, z);
    else if (k === "forest") {
      const mix = [darkProto, teakProto, banyanProto, rubberProto, jackProto];
      for (let i = 0; i < 14; i++) placeTree(mix[i % mix.length], x + (hash(i, 1) - 0.5) * 28, z + (hash(i, 2) - 0.5) * 28, 1.1 + hash(i, 3) * 0.35, 0.7);
    } else if (k === "tea") {
      addJob(root, jobs, "picker", x, z + 6);
    }
  }

  addJob(root, jobs, "coconut", CURRENT.start.x + 8, CURRENT.start.z - 6);

  if (!fishSpots.length) {
    const px = CURRENT.start.x + 14;
    const pz = CURRENT.start.z + 10;
    fishSpots.push(makePond(root, px, pz, 4.4));
    addJob(root, jobs, "fisher", px + 5.6, pz);
  }

  for (const p of CURRENT.places.slice(0, 6)) {
    nightLights.push(lampPost(root, p.x + 4, p.z + 3));
  }

  const R = lite ? 900 : 2500;
  const rgeo = new THREE.BufferGeometry();
  const rpos = new Float32Array(R * 3);
  for (let i = 0; i < R; i++) {
    rpos[i * 3] = (Math.random() - 0.5) * 80;
    rpos[i * 3 + 1] = Math.random() * 28;
    rpos[i * 3 + 2] = (Math.random() - 0.5) * 80;
  }
  rgeo.setAttribute("position", new THREE.BufferAttribute(rpos, 3));
  const rain = new THREE.Points(rgeo, new THREE.PointsMaterial({ color: 0xb7c9d4, size: 0.06, transparent: true, opacity: 0.55 }));
  root.add(rain);
  extras.rain = rain;

  const L = lite ? 80 : 160;
  const lgeo = new THREE.BufferGeometry();
  const lpos = new Float32Array(L * 3);
  for (let i = 0; i < L; i++) {
    lpos[i * 3] = (Math.random() - 0.5) * 90;
    lpos[i * 3 + 1] = Math.random() * 14;
    lpos[i * 3 + 2] = (Math.random() - 0.5) * 90;
  }
  lgeo.setAttribute("position", new THREE.BufferAttribute(lpos, 3));
  const leaves = new THREE.Points(lgeo, new THREE.PointsMaterial({ color: 0x5a9a32, size: 0.18, transparent: true, opacity: 0.7 }));
  root.add(leaves);
  extras.leaves = leaves;
  const L2 = lite ? 50 : 110;
  const lgeo2 = new THREE.BufferGeometry();
  const lpos2 = new Float32Array(L2 * 3);
  for (let i = 0; i < L2; i++) {
    lpos2[i * 3] = (Math.random() - 0.5) * 90;
    lpos2[i * 3 + 1] = Math.random() * 14;
    lpos2[i * 3 + 2] = (Math.random() - 0.5) * 90;
  }
  lgeo2.setAttribute("position", new THREE.BufferAttribute(lpos2, 3));
  const leaflets = new THREE.Points(lgeo2, new THREE.PointsMaterial({ color: 0xc45c26, size: 0.16, transparent: true, opacity: 0.65 }));
  root.add(leaflets);
  extras.leaflets = leaflets;

  const F = 80;
  const fgeo = new THREE.BufferGeometry();
  const fpos = new Float32Array(F * 3);
  for (let i = 0; i < F; i++) {
    fpos[i * 3] = CURRENT.start.x + (Math.random() - 0.5) * 40;
    fpos[i * 3 + 1] = 2 + Math.random() * 4;
    fpos[i * 3 + 2] = CURRENT.start.z + (Math.random() - 0.5) * 40;
  }
  fgeo.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
  const flies = new THREE.Points(fgeo, new THREE.PointsMaterial({ color: 0xd4ff6a, size: 0.12, transparent: true, opacity: 0 }));
  root.add(flies);
  extras.flies = flies;
  extras.nightLights = nightLights;
  extras.colliders = colliders;
  extras.docks = docks;
  extras.fishSpots = fishSpots;

  return extras;
}

export function surfaceY(x, z, docks) {
  let h = heightAt(x, z);
  if (docks) {
    for (const d of docks) {
      const dx = x - d.x, dz = z - d.z;
      const c = Math.cos(-d.rot || 0), s = Math.sin(-d.rot || 0);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < (d.w || 4) / 2 && Math.abs(lz) < (d.l || 12) / 2) h = Math.max(h, d.y);
    }
  }
  return h;
}
