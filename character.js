import * as THREE from "three";

/** One Minecraft pixel = 1/16 block. Steve is exactly 32 px = 2 blocks tall. */
const PX = 1 / 16;
const SKIN = 64;

function rgb(n) {
  n = Number(n) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  return [
    (a[0] + (b[0] - a[0]) * t) | 0,
    (a[1] + (b[1] - a[1]) * t) | 0,
    (a[2] + (b[2] - a[2]) * t) | 0,
  ];
}
function px(d, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x > 63 || y > 63) return;
  const i = (y * SKIN + x) * 4;
  d[i] = r;
  d[i + 1] = g;
  d[i + 2] = b;
  d[i + 3] = a;
}
function rect(d, x, y, w, h, c, k = 1, a = 255) {
  const r = Math.max(0, Math.min(255, (c[0] * k) | 0));
  const g = Math.max(0, Math.min(255, (c[1] * k) | 0));
  const b = Math.max(0, Math.min(255, (c[2] * k) | 0));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(d, x + i, y + j, r, g, b, a);
}
/** Classic Minecraft skin net: top, bottom, right, front, left, back. */
function cube(d, ox, oy, w, h, dep, c, a = 255) {
  rect(d, ox + dep, oy, w, dep, c, 1.18, a);
  rect(d, ox + dep + w, oy, w, dep, c, 0.62, a);
  rect(d, ox, oy + dep, dep, h, c, 0.84, a);
  rect(d, ox + dep, oy + dep, w, h, c, 1.0, a);
  rect(d, ox + dep + w, oy + dep, dep, h, c, 0.84, a);
  rect(d, ox + dep + w + dep, oy + dep, w, h, c, 0.74, a);
}

/**
 * Map a BoxGeometry's 6 faces onto a 64×64 Minecraft skin.
 * Face order in Three.js: +X −X +Y −Y +Z −Z  (left, right, top, bottom, front, back)
 */
function skinUV(geo, faces) {
  const uv = geo.attributes.uv;
  const pad = 0.02;
  for (let f = 0; f < 6; f++) {
    const { u, v, w, h } = faces[f];
    const u0 = (u + pad) / SKIN;
    const u1 = (u + w - pad) / SKIN;
    const vt = 1 - (v + pad) / SKIN;
    const vb = 1 - (v + h - pad) / SKIN;
    const i = f * 4;
    uv.setXY(i + 0, u0, vt);
    uv.setXY(i + 1, u1, vt);
    uv.setXY(i + 2, u0, vb);
    uv.setXY(i + 3, u1, vb);
  }
  uv.needsUpdate = true;
  return geo;
}

const UV = {
  head: [
    { u: 16, v: 8, w: 8, h: 8 },
    { u: 0, v: 8, w: 8, h: 8 },
    { u: 8, v: 0, w: 8, h: 8 },
    { u: 16, v: 0, w: 8, h: 8 },
    { u: 8, v: 8, w: 8, h: 8 },
    { u: 24, v: 8, w: 8, h: 8 },
  ],
  hat: [
    { u: 48, v: 8, w: 8, h: 8 },
    { u: 32, v: 8, w: 8, h: 8 },
    { u: 40, v: 0, w: 8, h: 8 },
    { u: 48, v: 0, w: 8, h: 8 },
    { u: 40, v: 8, w: 8, h: 8 },
    { u: 56, v: 8, w: 8, h: 8 },
  ],
  body: [
    { u: 28, v: 20, w: 4, h: 12 },
    { u: 16, v: 20, w: 4, h: 12 },
    { u: 20, v: 16, w: 8, h: 4 },
    { u: 28, v: 16, w: 8, h: 4 },
    { u: 20, v: 20, w: 8, h: 12 },
    { u: 32, v: 20, w: 8, h: 12 },
  ],
  jacket: [
    { u: 28, v: 36, w: 4, h: 12 },
    { u: 16, v: 36, w: 4, h: 12 },
    { u: 20, v: 32, w: 8, h: 4 },
    { u: 28, v: 32, w: 8, h: 4 },
    { u: 20, v: 36, w: 8, h: 12 },
    { u: 32, v: 36, w: 8, h: 12 },
  ],
  rArm: [
    { u: 48, v: 20, w: 4, h: 12 },
    { u: 40, v: 20, w: 4, h: 12 },
    { u: 44, v: 16, w: 4, h: 4 },
    { u: 48, v: 16, w: 4, h: 4 },
    { u: 44, v: 20, w: 4, h: 12 },
    { u: 52, v: 20, w: 4, h: 12 },
  ],
  lArm: [
    { u: 40, v: 52, w: 4, h: 12 },
    { u: 32, v: 52, w: 4, h: 12 },
    { u: 36, v: 48, w: 4, h: 4 },
    { u: 40, v: 48, w: 4, h: 4 },
    { u: 36, v: 52, w: 4, h: 12 },
    { u: 44, v: 52, w: 4, h: 12 },
  ],
  rLeg: [
    { u: 8, v: 20, w: 4, h: 12 },
    { u: 0, v: 20, w: 4, h: 12 },
    { u: 4, v: 16, w: 4, h: 4 },
    { u: 8, v: 16, w: 4, h: 4 },
    { u: 4, v: 20, w: 4, h: 12 },
    { u: 12, v: 20, w: 4, h: 12 },
  ],
  lLeg: [
    { u: 24, v: 52, w: 4, h: 12 },
    { u: 16, v: 52, w: 4, h: 12 },
    { u: 20, v: 48, w: 4, h: 4 },
    { u: 24, v: 48, w: 4, h: 4 },
    { u: 20, v: 52, w: 4, h: 12 },
    { u: 28, v: 52, w: 4, h: 12 },
  ],
};

function paintSkin(p) {
  const skin = rgb(p.skin || 0xc68642);
  const shirt = rgb(p.shirt || 0xf0e6d0);
  const pants = rgb(p.pants || 0x2c3a4a);
  const hair = rgb(p.hair || 0x1a1210);
  const shoe = mix(pants, [20, 16, 14], 0.55);
  const lip = rgb(p.lip || (p.gender === "f" ? 0xb45a52 : 0x8a5048));
  const eye = mix(hair, [40, 28, 18], 0.35);
  const white = [240, 236, 230];
  const scarf = rgb(p.scarf || 0x7a2038);
  const saree = p.saree ? rgb(p.saree) : null;
  const style = p.hairStyle || (p.gender === "f" ? "long" : "short");

  const c = document.createElement("canvas");
  c.width = c.height = SKIN;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(SKIN, SKIN);
  const d = img.data;

  // --- base layer ---
  cube(d, 0, 0, 8, 8, 8, skin); // head
  cube(d, 16, 16, 8, 12, 4, saree || shirt); // body
  cube(d, 40, 16, 4, 12, 4, shirt); // right arm
  cube(d, 32, 48, 4, 12, 4, shirt); // left arm
  cube(d, 0, 16, 4, 12, 4, pants); // right leg
  cube(d, 16, 48, 4, 12, 4, pants); // left leg

  // hands (lower 4 px of arms) — skin
  rect(d, 40, 16 + 4 + 8, 4, 4, skin, 0.84);
  rect(d, 44, 16 + 4 + 8, 4, 4, skin, 1.0);
  rect(d, 48, 16 + 4 + 8, 4, 4, skin, 0.84);
  rect(d, 52, 16 + 4 + 8, 4, 4, skin, 0.74);
  rect(d, 32, 48 + 4 + 8, 4, 4, skin, 0.84);
  rect(d, 36, 48 + 4 + 8, 4, 4, skin, 1.0);
  rect(d, 40, 48 + 4 + 8, 4, 4, skin, 0.84);
  rect(d, 44, 48 + 4 + 8, 4, 4, skin, 0.74);

  // shoes (lower 2 px of legs)
  rect(d, 0, 16 + 4 + 10, 4, 2, shoe, 0.84);
  rect(d, 4, 16 + 4 + 10, 4, 2, shoe, 1.0);
  rect(d, 8, 16 + 4 + 10, 4, 2, shoe, 0.84);
  rect(d, 12, 16 + 4 + 10, 4, 2, shoe, 0.74);
  rect(d, 16, 48 + 4 + 10, 4, 2, shoe, 0.84);
  rect(d, 20, 48 + 4 + 10, 4, 2, shoe, 1.0);
  rect(d, 24, 48 + 4 + 10, 4, 2, shoe, 0.84);
  rect(d, 28, 48 + 4 + 10, 4, 2, shoe, 0.74);

  // face on head front (8,8)
  const fx = 8, fy = 8;
  rect(d, fx, fy, 8, 2, hair, 1.05); // bangs
  rect(d, fx + 1, fy + 3, 2, 1, mix(hair, skin, 0.15), 0.7);
  rect(d, fx + 5, fy + 3, 2, 1, mix(hair, skin, 0.15), 0.7);
  rect(d, fx + 1, fy + 4, 2, 2, white, 1);
  rect(d, fx + 5, fy + 4, 2, 2, white, 1);
  px(d, fx + 2, fy + 4, eye[0], eye[1], eye[2]);
  px(d, fx + 2, fy + 5, eye[0], eye[1], eye[2]);
  px(d, fx + 5, fy + 4, eye[0], eye[1], eye[2]);
  px(d, fx + 5, fy + 5, eye[0], eye[1], eye[2]);
  if (p.mustache) rect(d, fx + 2, fy + 6, 4, 1, hair, 0.9);
  else rect(d, fx + 3, fy + 6, 2, 1, lip, 0.95);

  if (p.glasses) {
    rect(d, fx + 1, fy + 4, 2, 2, [18, 16, 14], 1);
    rect(d, fx + 5, fy + 4, 2, 2, [18, 16, 14], 1);
    px(d, fx + 2, fy + 4, 40, 70, 90);
    px(d, fx + 6, fy + 4, 40, 70, 90);
    rect(d, fx + 3, fy + 4, 2, 1, [18, 16, 14], 1);
  }

  // ears on side faces
  rect(d, 0 + 3, 8 + 3, 2, 3, skin, 0.75);
  rect(d, 16 + 3, 8 + 3, 2, 3, skin, 0.75);

  // --- hat / overlay layer ---
  const wrap = style === "scarf" ? scarf : style === "crown" ? rgb(0xc41e3a) : style === "hat" ? rgb(0x5a3a22) : hair;
  if (style !== "none") {
    cube(d, 32, 0, 8, 8, 8, wrap, 255);
    // punch a face window so the overlay doesn't cover eyes
    const open = style === "scarf" ? 5 : 6;
    for (let j = 8 - open; j < 8; j++) for (let i = 0; i < 8; i++) px(d, 40 + i, 8 + j, 0, 0, 0, 0);
    if (style === "scarf") {
      rect(d, 40, 8, 8, 2, wrap, 1.05); // keep bangs/forehead covered
    } else if (style !== "hat" && style !== "crown") {
      rect(d, 40, 8, 8, 2, hair, 1.05); // bangs
    }
  }

  // jacket overlay — slightly darker shirt, 1 px hem
  cube(d, 16, 32, 8, 12, 4, mix(saree || shirt, [20, 16, 12], 0.18), 220);
  // clear most of jacket front so base shirt reads, keep collar + hem
  for (let j = 2; j < 10; j++) for (let i = 1; i < 7; i++) px(d, 20 + i, 36 + j, 0, 0, 0, 0);

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function mat(tex, overlay = false) {
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
    transparent: overlay,
    alphaTest: overlay ? 0.45 : 0,
    side: overlay ? THREE.DoubleSide : THREE.FrontSide,
  });
}

function boxPart(w, h, d, uvs, material) {
  const geo = new THREE.BoxGeometry(w * PX, h * PX, d * PX);
  skinUV(geo, uvs);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function limb(w, h, d, uvs, material) {
  const g = new THREE.Group();
  const mesh = boxPart(w, h, d, uvs, material);
  mesh.position.y = -(h * PX) / 2;
  g.add(mesh);
  g.userData.box = mesh;
  return g;
}

function acc(color, w, h, d) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w * PX, h * PX, d * PX),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, flatShading: true })
  );
  m.castShadow = true;
  return m;
}

/**
 * Classic Minecraft Steve rig. 8×8×8 head, 8×12×4 body, 4×12×4 arms & legs.
 * Overlay (hat) layer included. Accessories stay as extra cubes.
 */
export function createHuman(p = {}) {
  const g = new THREE.Group();
  const child = p.age === "child";
  const elder = p.age === "elder";
  const fem = p.gender === "f";
  const style = p.hairStyle || (fem ? "long" : "short");
  const tex = paintSkin(p);
  const base = mat(tex, false);
  const over = mat(tex, true);

  // Legs pivot at y = 12 px (hip). Box hangs down to the ground.
  const lLeg = limb(4, 12, 4, UV.lLeg, base);
  const rLeg = limb(4, 12, 4, UV.rLeg, base);
  lLeg.position.set(-2 * PX, 12 * PX, 0);
  rLeg.position.set(2 * PX, 12 * PX, 0);
  g.add(lLeg, rLeg);

  // Body: 8×12×4, center at y = 18 px (spans 12–24).
  const body = new THREE.Group();
  body.position.y = 18 * PX;
  const bodyBox = boxPart(8, 12, 4, UV.body, base);
  body.add(bodyBox);
  const jacket = boxPart(8.5, 12.5, 4.5, UV.jacket, over);
  body.add(jacket);
  if (elder) body.rotation.x = 0.06;
  g.add(body);

  // Arms pivot at the shoulder (y = 22 px, just below body top).
  const lArm = limb(4, 12, 4, UV.lArm, base);
  const rArm = limb(4, 12, 4, UV.rArm, base);
  lArm.position.set(-6 * PX, 22 * PX, 0);
  rArm.position.set(6 * PX, 22 * PX, 0);
  g.add(lArm, rArm);

  // Head pivot at the neck (y = 24 px). Cube sits 8 px above.
  const head = new THREE.Group();
  head.position.y = 24 * PX;
  const headBox = boxPart(8, 8, 8, UV.head, base);
  headBox.position.y = 4 * PX;
  head.add(headBox);
  const hat = boxPart(9, 9, 9, UV.hat, over);
  hat.position.y = 4 * PX;
  head.add(hat);

  if (style === "long") {
    const hair = acc(p.hair || 0x1a1210, 8, 10, 2);
    hair.position.set(0, -2 * PX, -5 * PX);
    head.add(hair);
  }
  if (style === "bun") {
    const bun = acc(p.hair || 0xd9d4c8, 4, 4, 4);
    bun.position.set(0, 9 * PX, -5 * PX);
    head.add(bun);
  }
  if (style === "hat") {
    const brim = acc(0x5a3a22, 10, 1, 10);
    brim.position.y = 8.2 * PX;
    head.add(brim);
    const crown = acc(0x5a3a22, 8, 3, 8);
    crown.position.y = 10 * PX;
    head.add(crown);
  }
  if (style === "crown") {
    const band = acc(0xd4a017, 9, 2, 9);
    band.position.y = 8.6 * PX;
    head.add(band);
    for (const s of [-3, 0, 3]) {
      const spike = acc(0xc41e3a, 2, 3, 2);
      spike.position.set(s * PX, 11 * PX, 0);
      head.add(spike);
    }
  }
  if (style === "scarf") {
    const wrap = acc(p.scarf || 0x7a2038, 9, 3, 9);
    wrap.position.y = 0.5 * PX;
    head.add(wrap);
  }
  if (p.earrings || fem) {
    const gold = 0xd4a017;
    for (const s of [-1, 1]) {
      const e = acc(gold, 1, 1, 1);
      e.position.set(s * 4.6 * PX, 2 * PX, 0);
      head.add(e);
    }
  }
  if (p.glasses) {
    const frame = acc(0x111111, 8, 2, 1);
    frame.position.set(0, 4 * PX, 4.2 * PX);
    head.add(frame);
  }

  g.add(head);

  if (p.saree) {
    const drape = acc(p.saree, 2, 14, 6);
    drape.position.set(5 * PX, 17 * PX, 0);
    g.add(drape);
  }
  if (p.camera) {
    const cam = acc(0x1a1a1a, 3, 2, 2);
    cam.position.set(0, -2 * PX, 3 * PX);
    rArm.add(cam);
    const lens = acc(0x333333, 1, 1, 1);
    lens.position.set(0, -2 * PX, 4.2 * PX);
    rArm.add(lens);
  }
  if (p.cross) {
    const c1 = acc(0xc8a44a, 1, 4, 1);
    c1.position.set(0, 20 * PX, 2.4 * PX);
    g.add(c1);
    const c2 = acc(0xc8a44a, 3, 1, 1);
    c2.position.set(0, 21.5 * PX, 2.4 * PX);
    g.add(c2);
  }

  g.userData.limbs = { lArm, rArm, lLeg, rLeg, torso: body, head, face: head, hipY: 12 * PX };
  g.scale.setScalar(child ? 0.7 : 1);
  return g;
}

export function animateHuman(mesh, moving, t, swimming = false, sitting = false) {
  const L = mesh.userData.limbs;
  if (!L) return;
  const { lArm, rArm, lLeg, rLeg, torso, head } = L;

  if (sitting) {
    lLeg.rotation.x = -Math.PI / 2;
    rLeg.rotation.x = -Math.PI / 2;
    lArm.rotation.x = -0.35;
    rArm.rotation.x = -0.35;
    lArm.rotation.z = 0;
    rArm.rotation.z = 0;
    return;
  }

  if (swimming) {
    const k = Math.sin(t * 8);
    lArm.rotation.x = -Math.PI / 2 + k * 0.35;
    rArm.rotation.x = -Math.PI / 2 - k * 0.35;
    lLeg.rotation.x = k * 0.4;
    rLeg.rotation.x = -k * 0.4;
    return;
  }

  // Classic Minecraft walk: opposite arm / opposite leg, no knees.
  const a = Math.sin(t * (moving ? 8.4 : 0));
  const amp = moving ? 1.0 : 0;
  lArm.rotation.x = a * amp;
  rArm.rotation.x = -a * amp;
  lLeg.rotation.x = -a * amp;
  rLeg.rotation.x = a * amp;
  lArm.rotation.z = 0;
  rArm.rotation.z = 0;
  if (torso) torso.rotation.y = moving ? a * 0.04 : 0;
  if (head) head.rotation.y = moving ? a * 0.06 : Math.sin(t * 0.5) * 0.04;
}

export function styleFromNpc(n) {
  return (
    {
      maya: { gender: "f", hairStyle: "long", earrings: true, camera: true },
      amma: { gender: "f", age: "elder", hairStyle: "bun", hair: 0xd9d4c8, saree: 0xf3ead0, earrings: true },
      rajan: { gender: "m", hairStyle: "hat", mustache: true, glasses: true },
      fatima: { gender: "f", hairStyle: "scarf", earrings: true, scarf: 0x7a2038 },
      unni: { gender: "m", age: "child", hairStyle: "short" },
      joseph: { gender: "m", age: "elder", hairStyle: "short", glasses: true, hair: 0xe8e4dc, cross: true },
      nair: { gender: "m", hairStyle: "short", glasses: true, hair: 0x6a6058 },
      leela: { gender: "f", hairStyle: "bun", earrings: true },
      meera: { gender: "f", hairStyle: "scarf", earrings: true, scarf: 0x2d6a3a },
      vasu: { gender: "m", hairStyle: "crown" },
      karim: { gender: "m", age: "elder", hairStyle: "hat", hair: 0xc8c4bc, mustache: true, glasses: true },
    }[n.id] || { gender: "m", hairStyle: "short" }
  );
}
