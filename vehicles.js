import * as THREE from "three";

function box(w, h, d, color, y = 0, z = 0, x = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function wheel(r, w, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, w, 10),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
  );
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Kerala auto — yellow body, black snout, three wheels. */
export function makeAuto() {
  const g = new THREE.Group();
  g.add(box(1.35, 0.18, 2.15, 0xf5c400, 0.55));
  g.add(box(1.28, 0.95, 1.35, 0xf5c400, 1.1, -0.28));
  g.add(box(1.18, 0.55, 0.85, 0x161616, 0.95, 0.78));
  g.add(box(1.32, 0.06, 1.4, 0x1a1a1a, 1.62, -0.28));
  const roof = box(1.22, 0.05, 1.15, 0xc41e1e, 1.66, -0.22);
  g.add(roof);
  g.add(box(1.2, 0.42, 0.04, 0x88c8e8, 1.28, 0.38));
  g.add(box(0.08, 0.7, 0.08, 0x333, 1.15, 0.42, -0.62));
  g.add(box(0.08, 0.7, 0.08, 0x333, 1.15, 0.42, 0.62));
  g.add(wheel(0.28, 0.16, 0, 0.28, 0.92));
  g.add(wheel(0.3, 0.18, -0.62, 0.3, -0.7));
  g.add(wheel(0.3, 0.18, 0.62, 0.3, -0.7));
  g.add(box(0.22, 0.1, 0.08, 0xfff3c0, 0.78, 1.18));
  g.userData.kind = "auto";
  g.userData.seatY = 0.85;
  return g;
}

/** Activa-ish scooter. */
export function makeScooter() {
  const g = new THREE.Group();
  g.add(box(0.42, 0.14, 1.35, 0xf4ead5, 0.48));
  g.add(box(0.38, 0.32, 0.42, 0xe8dcc4, 0.72, -0.42));
  g.add(box(0.34, 0.46, 0.12, 0xf4ead5, 0.95, 0.42));
  g.add(box(0.7, 0.06, 0.08, 0x222, 1.18, 0.48));
  g.add(box(0.32, 0.08, 0.28, 0x7a2038, 0.62, -0.15));
  g.add(wheel(0.22, 0.1, 0, 0.22, 0.55));
  g.add(wheel(0.24, 0.12, 0, 0.24, -0.55));
  g.add(box(0.16, 0.08, 0.06, 0xfff3c0, 0.62, 0.7));
  g.userData.kind = "scooter";
  g.userData.seatY = 0.62;
  return g;
}
