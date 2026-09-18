import * as THREE from "three";
import { shared } from "./tex.js";
import { DISTRICTS, getDistrict, roadsFor } from "./districts.js";
import {
  WATER as T_WATER,
  SIZE as T_SIZE,
  GROUND_TINT,
  EDGE_TINT,
  shapeHeight,
  groundTint,
  terrainMaterial,
  buildGround,
  buildSkirt,
} from "./terrain.js";

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

export const WATER = T_WATER;
export const SIZE = T_SIZE;

/**
 * Scatter helper: deterministic per-coordinate randomness, used to place
 * trees, clouds, tea bushes and the like. (The terrain's own noise lives in
 * terrain.js — this is the cheap "one number per coordinate" hash.)
 */
function hash(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export let CURRENT = DISTRICTS[6];
export let LANDMARKS = [];
export let ROADS = [];

export function setDistrict(id) {
  CURRENT = getDistrict(id);
  LANDMARKS = CURRENT.places.map((p) => ({
    id: p.id, name: p.name, x: p.x, z: p.z, r: p.r || 16, region: CURRENT.name, kind: p.kind,
  }));
  ROADS = roadsFor(CURRENT);
  return CURRENT;
}

export function heightAt(x, z) {
  return shapeHeight(x, z, CURRENT);
}

export function biomeAt(x, z) {
  const h = heightAt(x, z);
  const kind = CURRENT?.kind || "coastal";
  const seed = CURRENT?.seed || 0;
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

function box(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}

function temple(root, x, z) {
  const g = new THREE.Group();
  const laterite = SM(0xe8d9b8, "laterite", { roughness: 0.88 });
  const plaster = SM(0xf3ead3, "plaster", { roughness: 0.84 });
  const copper = SM(0xb87333, "tile", { roughness: 0.45, metalness: 0.35 });
  const wood = SM(0x6b4a28, "wood", { roughness: 0.82 });
  const gold = SM(0xd4a017, "tile", { roughness: 0.35, metalness: 0.45 });
  box(g, new THREE.BoxGeometry(16, 0.7, 16), laterite, 0, 0.35, 0);
  box(g, new THREE.BoxGeometry(14.2, 0.28, 14.2), plaster, 0, 0.78, 0);
  for (const [wx, wz, ww, wd] of [
    [0, -7.4, 15.2, 0.55], [0, 7.4, 15.2, 0.55],
    [-7.4, 0, 0.55, 14.2], [7.4, 0, 0.55, 14.2],
  ]) box(g, new THREE.BoxGeometry(ww, 2.2, wd), laterite, wx, 1.85, wz);
  box(g, new THREE.BoxGeometry(3.4, 2.6, 1.1), laterite, 0, 2.0, 7.4);
  box(g, new THREE.BoxGeometry(6.4, 3.6, 6.4), plaster, 0, 2.7, 0);
  for (const s of [-2.2, 0, 2.2]) {
    box(g, new THREE.BoxGeometry(0.9, 1.2, 0.08), new THREE.MeshLambertMaterial({ color: 0x1a1a16 }), s, 2.6, 3.24);
  }
  for (let i = 0; i < 4; i++) {
    const py = new THREE.Mesh(new THREE.ConeGeometry(3.6 - i * 0.62, 1.45, 4), i === 3 ? gold : copper);
    py.position.y = 4.7 + i * 1.05;
    py.rotation.y = Math.PI / 4;
    g.add(py);
  }
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), gold);
  finial.position.y = 9.3;
  g.add(finial);
  for (const s of [-4.6, 4.6]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7.2, 8), wood);
    pole.position.set(s, 4.4, 5.4);
    g.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), gold);
    lamp.position.set(s, 8.1, 5.4);
    g.add(lamp);
  }
  for (let i = 0; i < 5; i++) {
    box(g, new THREE.BoxGeometry(4.2 - i * 0.35, 0.16, 0.7), laterite, 0, 0.12 + i * 0.16, 8.6 + i * 0.32);
  }
  g.position.set(x, heightAt(x, z), z);
  addShadow(g);
  root.add(g);
  return { type: "box", x, z, hw: 8.2, hd: 8.2, rot: 0 };
}

function church(root, x, z) {
  const g = new THREE.Group();
  const plaster = SM(0xf7f1e4, "plaster", { roughness: 0.84 });
  const tile = SM(0x8b1e1e, "tile", { roughness: 0.7 });
  const dark = SM(0x3a2a20, "wood", { roughness: 0.85 });
  box(g, new THREE.BoxGeometry(8.4, 0.5, 14), plaster, 0, 0.25, 0);
  box(g, new THREE.BoxGeometry(7.2, 4.2, 12.2), plaster, 0, 2.4, -0.4);
  box(g, new THREE.BoxGeometry(9.2, 3.2, 4.4), plaster, 0, 1.9, 1.2);
  roof(g, 4.7, 7.8, 12.6, 0x8b1e1e);
  box(g, new THREE.BoxGeometry(2.2, 6.4, 2.2), plaster, 0, 5.4, 5.6);
  box(g, new THREE.ConeGeometry(1.5, 2.4, 4), tile, 0, 9.6, 5.6);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), dark);
  crossV.position.set(0, 11.1, 5.6);
  g.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.12), dark);
  crossH.position.set(0, 10.85, 5.6);
  g.add(crossH);
  for (const s of [-2.4, 0, 2.4]) {
    box(g, new THREE.BoxGeometry(0.9, 1.5, 0.08), new THREE.MeshLambertMaterial({ color: 0x7eafc4 }), s, 2.8, 5.74);
  }
  for (let i = 0; i < 4; i++) {
    box(g, new THREE.BoxGeometry(3.6 - i * 0.3, 0.16, 0.65), plaster, 0, 0.12 + i * 0.16, 7.4 + i * 0.3);
  }
  g.position.set(x, heightAt(x, z), z);
  addShadow(g);
  root.add(g);
  return { type: "box", x, z, hw: 4.8, hd: 7.4, rot: 0 };
}

function mosque(root, x, z) {
  const g = new THREE.Group();
  const cream = SM(0xf4efe4, "plaster", { roughness: 0.84 });
  const domeM = SM(0xd4c48a, "plaster", { roughness: 0.5 });
  const green = SM(0x2d6a3a, "tile", { roughness: 0.62 });
  box(g, new THREE.BoxGeometry(12, 0.45, 12), cream, 0, 0.22, 0);
  box(g, new THREE.BoxGeometry(8.2, 3.6, 9.2), cream, 0, 2.0, 0);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.35, 12, 10), domeM);
  dome.position.y = 4.85;
  g.add(dome);
  box(g, new THREE.CylinderGeometry(0.18, 0.18, 0.9, 8), green, 0, 7.4, 0);
  for (const [mx, mz] of [[-4.4, 4.0], [4.4, 4.0]]) {
    box(g, new THREE.CylinderGeometry(0.32, 0.42, 8.4, 10), cream, mx, 4.2, mz);
    box(g, new THREE.ConeGeometry(0.55, 0.9, 8), green, mx, 8.7, mz);
  }
  for (const s of [-2.4, 0, 2.4]) {
    box(g, new THREE.BoxGeometry(1.0, 1.4, 0.08), new THREE.MeshLambertMaterial({ color: 0x1a4a3a }), s, 2.2, 4.64);
  }
  g.position.set(x, heightAt(x, z), z);
  addShadow(g);
  root.add(g);
  return { type: "box", x, z, hw: 6.2, hd: 6.2, rot: 0 };
}

function lighthouse(root, x, z) {
  const g = new THREE.Group();
  const y = Math.max(heightAt(x, z), WATER + 1);
  const plaster = SM(0xf2efe8, "plaster", { roughness: 0.84 });
  const red = SM(0xb42318, "plaster", { roughness: 0.8 });
  box(g, new THREE.CylinderGeometry(2.4, 3.0, 1.2, 12), plaster, 0, 0.6, 0);
  box(g, new THREE.CylinderGeometry(1.35, 2.05, 14, 12), plaster, 0, 8.2, 0);
  box(g, new THREE.CylinderGeometry(1.55, 1.75, 2.4, 12), red, 0, 12.4, 0);
  box(g, new THREE.CylinderGeometry(1.65, 1.65, 2.0, 12), new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffcc66, emissiveIntensity: 0.7 }), 0, 16.5, 0);
  box(g, new THREE.ConeGeometry(1.7, 1.4, 8), red, 0, 18.1, 0);
  g.position.set(x, y, z);
  root.add(g);
  return { x, z, r: 3.8, topY: y + 19 };
}

function makeFort(root, x, z, colliders) {
  const y = heightAt(x, z);
  const mat = SM(0xb45a32, "laterite", { roughness: 0.9 });
  const wall = (wx, wz, w, d, h = 3.2) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(wx, y + h / 2, wz);
    root.add(m);
  };
  wall(x, z - 9, 20, 1.1, 3.4);
  wall(x, z + 9, 20, 1.1, 3.4);
  wall(x - 9.6, z, 1.1, 18, 3.4);
  wall(x + 9.6, z, 1.1, 18, 3.4);
  for (const [bx, bz] of [[-9.6, -9], [9.6, -9], [-9.6, 9], [9.6, 9]]) {
    const keep = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5.2, 3.4), mat);
    keep.position.set(x + bx, y + 2.6, z + bz);
    root.add(keep);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.35, 3.8), mat);
    cap.position.set(x + bx, y + 5.4, z + bz);
    root.add(cap);
  }
  const gate = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.4, 1.6), mat);
  gate.position.set(x, y + 2.2, z + 9);
  root.add(gate);
  const keepG = new THREE.Group();
  const inner = new THREE.Mesh(new THREE.BoxGeometry(6.5, 4.8, 6.5), SM(0xece4d4, "plaster", { roughness: 0.86 }));
  inner.position.y = 2.4;
  keepG.add(inner);
  roof(keepG, 5.0, 7.0, 7.0, 0x6b5335);
  keepG.position.set(x, y, z);
  root.add(keepG);
  colliders.push({ type: "box", x, z: z - 9, hw: 10.2, hd: 0.7, rot: 0 });
  colliders.push({ type: "box", x: x - 5.2, z: z + 9, hw: 4.2, hd: 0.7, rot: 0 });
  colliders.push({ type: "box", x: x + 5.2, z: z + 9, hw: 4.2, hd: 0.7, rot: 0 });
  colliders.push({ type: "box", x: x - 9.6, z, hw: 0.7, hd: 9.2, rot: 0 });
  colliders.push({ type: "box", x: x + 9.6, z, hw: 0.7, hd: 9.2, rot: 0 });
  colliders.push({ type: "box", x, z, hw: 3.5, hd: 3.5, rot: 0 });
}

function makeHotel(root, x, z, colliders) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  const plaster = SM(0xece4d4, "plaster", { roughness: 0.86 });
  const accent = new THREE.MeshLambertMaterial({ color: 0xc45c26 });
  box(g, new THREE.BoxGeometry(12.4, 0.4, 8.2), plaster, 0, 0.2, 0);
  box(g, new THREE.BoxGeometry(11.2, 7.2, 7.0), plaster, 0, 3.8, 0);
  box(g, new THREE.BoxGeometry(11.5, 0.2, 7.3), accent, 0, 4.0, 0);
  box(g, new THREE.BoxGeometry(11.5, 0.2, 7.3), accent, 0, 6.4, 0);
  box(g, new THREE.BoxGeometry(4.2, 0.7, 0.12), new THREE.MeshLambertMaterial({ color: 0x1a4a7a }), 0, 6.9, 3.56);
  for (const fy of [2.4, 4.8]) {
    for (const s of [-3.8, -1.3, 1.3, 3.8]) {
      box(g, new THREE.BoxGeometry(1.15, 1.05, 0.08), new THREE.MeshLambertMaterial({ color: 0x7eafc4 }), s, fy, 3.54);
    }
  }
  box(g, new THREE.BoxGeometry(2.2, 2.4, 0.2), SM(0x6b4a28, "wood", { roughness: 0.82 }), 0, 1.4, 3.55);
  box(g, new THREE.BoxGeometry(3.6, 0.18, 2.2), plaster, 0, 2.7, 4.4);
  g.position.set(x, y, z);
  addShadow(g);
  root.add(g);
  colliders.push({ type: "box", x, z, hw: 5.8, hd: 3.7, rot: 0 });
}

function makeChaya(root, x, z, colliders) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  const wood = SM(0x6b4a28, "wood", { roughness: 0.82 });
  const tin = new THREE.MeshLambertMaterial({ color: 0x3d8a4a });
  box(g, new THREE.BoxGeometry(6.4, 0.1, 4.6), tin, 0, 2.55, 0, 0, 0, 0.07);
  for (const [px, pz] of [[-2.6, 1.8], [2.6, 1.8], [-2.6, -1.6], [2.6, -1.6]]) {
    box(g, new THREE.CylinderGeometry(0.07, 0.09, 2.5, 6), wood, px, 1.25, pz);
  }
  box(g, new THREE.BoxGeometry(5.2, 0.9, 1.4), wood, 0, 0.7, -0.6);
  box(g, new THREE.BoxGeometry(4.4, 0.32, 0.55), wood, 0, 0.42, 1.5);
  box(g, new THREE.BoxGeometry(4.4, 0.32, 0.55), wood, 0, 0.42, 2.1);
  box(g, new THREE.CylinderGeometry(0.18, 0.22, 0.32, 8), new THREE.MeshLambertMaterial({ color: 0xc45c26 }), 1.2, 1.28, -0.4);
  box(g, new THREE.CylinderGeometry(0.14, 0.16, 0.28, 8), new THREE.MeshLambertMaterial({ color: 0x333 }), 0.6, 1.24, -0.5);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffe2a0, emissive: 0xffc14d, emissiveIntensity: 0.75 }));
  lamp.position.set(-1.8, 2.15, 1.2);
  g.add(lamp);
  g.position.set(x, y, z);
  addShadow(g);
  root.add(g);
  colliders.push({ type: "box", x, z, hw: 3.2, hd: 2.2, rot: 0 });
}

function makeThattu(root, x, z, colliders) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  const wood = SM(0x6b4a28, "wood", { roughness: 0.82 });
  box(g, new THREE.BoxGeometry(3.4, 0.85, 2.0), wood, 0, 0.85, 0);
  for (const s of [-1.2, 1.2]) {
    box(g, new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), new THREE.MeshLambertMaterial({ color: 0x222 }), s, 0.22, 0.7);
    box(g, new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), new THREE.MeshLambertMaterial({ color: 0x222 }), s, 0.22, -0.7);
  }
  box(g, new THREE.BoxGeometry(3.6, 0.08, 2.2), new THREE.MeshLambertMaterial({ color: 0xc41e3a }), 0, 2.25, 0);
  for (const s of [-1.4, 1.4]) box(g, new THREE.CylinderGeometry(0.05, 0.06, 1.3, 5), wood, s, 1.55, 0.8);
  box(g, new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0x333 }), 0, 1.35, 0);
  box(g, new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10), new THREE.MeshLambertMaterial({ color: 0x444 }), 0.9, 1.32, 0.3);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshLambertMaterial({ color: 0xffe2a0, emissive: 0xffc14d, emissiveIntensity: 0.75 }));
  lamp.position.set(1.1, 1.7, 0);
  g.add(lamp);
  g.position.set(x, y, z);
  addShadow(g);
  root.add(g);
  colliders.push({ type: "box", x, z, hw: 1.8, hd: 1.1, rot: 0 });
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
  const rockM = new THREE.MeshLambertMaterial({ color: 0x6a6a58 });
  const rock2 = new THREE.MeshLambertMaterial({ color: 0x7a7a64 });
  const a = new THREE.Mesh(new THREE.ConeGeometry(5.2, 9.5, 6), rockM);
  a.position.set(x, y + 4.6, z);
  root.add(a);
  const b = new THREE.Mesh(new THREE.DodecahedronGeometry(2.8, 0), rock2);
  b.position.set(x - 3.4, y + 2.2, z + 1.6);
  root.add(b);
  const c = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 0), rockM);
  c.position.set(x + 3.2, y + 1.8, z - 1.4);
  root.add(c);
  const shrine = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 1.1), SM(0xe8d9b8, "laterite", { roughness: 0.88 }));
  shrine.position.set(x, y + 9.6, z);
  root.add(shrine);
  colliders.push({ x, z, r: 4.6 });
}

function makeDam(root, x, z, colliders) {
  const y = heightAt(x, z);
  const conc = new THREE.MeshLambertMaterial({ color: 0x9aa09a });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(22, 7.2, 1.8), conc);
  wall.position.set(x, y + 3.5, z);
  root.add(wall);
  for (const s of [-9, 9]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(2.4, 9.0, 2.4), conc);
    t.position.set(x + s, y + 4.5, z);
    root.add(t);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(22, 0.12, 0.12), conc);
  rail.position.set(x, y + 7.3, z + 0.7);
  root.add(rail);
  colliders.push({ type: "box", x, z, hw: 11.2, hd: 1.2, rot: 0 });
}

function makeCave(root, x, z, colliders) {
  const y = heightAt(x, z);
  const rockM = new THREE.MeshLambertMaterial({ color: 0x8a8474 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2820 });
  for (const [ox, oz, s] of [[-3.2, 0.4, 3.1], [3.2, 0.2, 3.0], [0, -2.4, 2.6], [-1.6, 2.2, 2.2], [1.8, 2.4, 2.3]]) {
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockM);
    rk.position.set(x + ox, y + s * 0.7, z + oz);
    root.add(rk);
    colliders.push({ x: x + ox, z: z + oz, r: s * 0.72 });
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 1.2), dark);
  mouth.position.set(x, y + 1.4, z + 1.6);
  root.add(mouth);
}

function makePalace(root, x, z, colliders) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  const laterite = SM(0xb45a32, "laterite", { roughness: 0.9 });
  const plaster = SM(0xf0e6d2, "plaster", { roughness: 0.84 });
  box(g, new THREE.BoxGeometry(18, 0.5, 10), laterite, 0, 0.25, 0);
  box(g, new THREE.BoxGeometry(16.4, 4.6, 8.2), plaster, 0, 2.55, 0);
  box(g, new THREE.BoxGeometry(6.2, 6.2, 6.2), plaster, 0, 3.4, 0);
  roof(g, 5.1, 16.8, 8.8, 0x6b5335);
  roof(g, 6.8, 6.8, 6.8, 0x8b1e1e);
  for (const s of [-6, -2, 2, 6]) {
    box(g, new THREE.BoxGeometry(1.1, 1.4, 0.08), new THREE.MeshLambertMaterial({ color: 0x7eafc4 }), s, 2.8, 4.14);
  }
  for (const s of [-5.5, 5.5]) {
    box(g, new THREE.CylinderGeometry(0.18, 0.22, 4.4, 8), SM(0x6b4a28, "wood", { roughness: 0.82 }), s, 2.4, 3.6);
  }
  g.position.set(x, y, z);
  addShadow(g);
  root.add(g);
  colliders.push({ type: "box", x, z, hw: 8.5, hd: 4.4, rot: 0 });
}

function makeFactory(root, x, z, colliders) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  const plaster = SM(0xe8e0d0, "plaster", { roughness: 0.88 });
  const tin = new THREE.MeshLambertMaterial({ color: 0x6a7a4a });
  box(g, new THREE.BoxGeometry(14, 4.2, 6.4), plaster, 0, 2.1, 0);
  box(g, new THREE.BoxGeometry(14.4, 0.12, 6.8), tin, 0, 4.3, 0, 0, 0, 0.06);
  box(g, new THREE.CylinderGeometry(0.55, 0.7, 8.5, 10), SM(0xb45a32, "laterite", { roughness: 0.9 }), 5.4, 5.2, -1.2);
  for (const s of [-4, 0, 4]) {
    box(g, new THREE.BoxGeometry(1.6, 1.2, 0.08), new THREE.MeshLambertMaterial({ color: 0x7eafc4 }), s, 2.4, 3.24);
  }
  g.position.set(x, y, z);
  addShadow(g);
  root.add(g);
  colliders.push({ type: "box", x, z, hw: 7.2, hd: 3.4, rot: 0 });
}

function makeShrine(root, x, z, colliders) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  const laterite = SM(0xe8d9b8, "laterite", { roughness: 0.88 });
  const wood = SM(0x6b4a28, "wood", { roughness: 0.82 });
  const red = new THREE.MeshLambertMaterial({ color: 0xb42318 });
  box(g, new THREE.CylinderGeometry(2.2, 2.4, 0.4, 12), laterite, 0, 0.2, 0);
  box(g, new THREE.BoxGeometry(1.8, 2.2, 1.8), laterite, 0, 1.4, 0);
  box(g, new THREE.ConeGeometry(1.5, 1.3, 4), SM(0xb87333, "tile", { roughness: 0.5, metalness: 0.3 }), 0, 2.9, 0);
  for (const a of [0, 2.1, 4.2]) {
    const px = Math.cos(a) * 2.6, pz = Math.sin(a) * 2.6;
    box(g, new THREE.CylinderGeometry(0.05, 0.06, 3.4, 5), wood, px, 1.7, pz);
    box(g, new THREE.BoxGeometry(0.55, 0.7, 0.04), red, px, 3.2, pz);
  }
  g.position.set(x, y, z);
  addShadow(g);
  root.add(g);
  colliders.push({ x, z, r: 1.6 });
}

function makeTower(root, x, z, colliders) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  const plaster = SM(0xf2efe8, "plaster", { roughness: 0.84 });
  box(g, new THREE.BoxGeometry(3.6, 0.4, 3.6), plaster, 0, 0.2, 0);
  box(g, new THREE.BoxGeometry(2.8, 9.2, 2.8), plaster, 0, 4.8, 0);
  box(g, new THREE.BoxGeometry(3.4, 1.6, 3.4), plaster, 0, 10.2, 0);
  box(g, new THREE.ConeGeometry(2.2, 1.8, 4), SM(0x8b1e1e, "tile", { roughness: 0.7 }), 0, 11.9, 0);
  for (const fy of [3.2, 6.4]) {
    box(g, new THREE.BoxGeometry(0.7, 0.9, 0.08), new THREE.MeshLambertMaterial({ color: 0x7eafc4 }), 0, fy, 1.44);
  }
  g.position.set(x, y, z);
  addShadow(g);
  root.add(g);
  colliders.push({ type: "box", x, z, hw: 1.7, hd: 1.7, rot: 0 });
}

function makeMandapam(root, x, z, colliders) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  const laterite = SM(0xe8d9b8, "laterite", { roughness: 0.88 });
  const wood = SM(0x6b4a28, "wood", { roughness: 0.82 });
  box(g, new THREE.BoxGeometry(7.2, 0.45, 7.2), laterite, 0, 0.22, 0);
  for (const [px, pz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) {
    box(g, new THREE.CylinderGeometry(0.16, 0.2, 3.2, 8), wood, px, 1.85, pz);
  }
  box(g, new THREE.BoxGeometry(7.6, 0.16, 7.6), SM(0x6b5335, "tile", { roughness: 0.7 }), 0, 3.55, 0);
  g.position.set(x, y, z);
  addShadow(g);
  root.add(g);
  colliders.push({ type: "box", x, z, hw: 3.6, hd: 3.6, rot: 0 });
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
  const paddyMat = terrainMaterial({ tint: GROUND_TINT.paddy, flatShading: false });
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
  const sandM = terrainMaterial({ tint: GROUND_TINT.beach, flatShading: false });
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
  const extras = { root, nets: [], boats: [], rain: null, water: null, sun: null, hemi: null, lamp: null, fishSpots, shops, jobs, sway };

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

  const SEG = lite ? 84 : 132;
  const ground = new THREE.Mesh(
    buildGround(SIZE, SEG, heightAt, (x, z, h) => groundTint(x, z, CURRENT, h)),
    // Smooth shading, like the ground slab in the reference scene: the surface
    // is one calm green plane and all of its detail is colour, not facets.
    terrainMaterial({ flatShading: false })
  );
  ground.receiveShadow = true;
  ground.name = "ground";
  root.add(ground);

  // The slab edge, like the side of the ground in the reference scene: the map
  // is a finished piece of land sitting in the sea, not an infinitely thin plane.
  const skirt = new THREE.Mesh(
    buildSkirt(SIZE, lite ? 40 : 72, heightAt, EDGE_TINT),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  );
  skirt.receiveShadow = true;
  skirt.name = "ground-edge";
  root.add(skirt);

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

  // Tufts of grass. Deliberately short and thin, and tinted from the same green
  // family as the ground (the reference scene has no tall straw at all), so they
  // read as extra texture on the meadow instead of a second, clashing surface.
  const grassGeo = new THREE.ConeGeometry(0.055, 0.42, 3);
  grassGeo.translate(0, 0.21, 0);
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x6fa63a, side: THREE.DoubleSide });
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
  const tmpCol = new THREE.Color();
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
      const sc = 0.55 + hash(p * 80 + k, 75) * 0.7;
      dummy.scale.set(sc * 0.85, sc * (0.9 + hash(k, 79) * 0.8), sc * 0.85);
      dummy.updateMatrix();
      grass.setMatrixAt(gi, dummy.matrix);
      // Per-tuft tint: mostly the meadow green, a few blades catching the light.
      const gv = hash(p * 80 + k, 81);
      grass.setColorAt(
        gi,
        tmpCol.setRGB(
          0.72 + gv * 0.62,
          0.92 + gv * 0.26,
          0.70 + gv * 0.55,
          THREE.LinearSRGBColorSpace
        )
      );
      gi++;
    }
  }
  grass.count = gi;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  root.add(grass);
  extras.grass = grass;

  for (const p of CURRENT.places) {
    try {
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
    else if (k === "jetty") makeMandapam(root, x, z, colliders);
    else if (k === "nets") makeTower(root, x, z, colliders);
    else if (k === "houseboat") makeMandapam(root, x, z, colliders);
    else if (k === "palace") makePalace(root, x, z, colliders);
    else if (k === "factory") makeFactory(root, x, z, colliders);
    else if (k === "shrine") makeShrine(root, x, z, colliders);
    else if (k === "tower") makeTower(root, x, z, colliders);
    else if (k === "mandapam") makeMandapam(root, x, z, colliders);
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
      makeFactory(root, x, z, colliders);
      addJob(root, jobs, "picker", x, z + 8);
    }
    } catch (err) {
      console.warn("landmark", p?.id, err);
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
