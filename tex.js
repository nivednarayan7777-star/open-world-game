import * as THREE from "three";

function canvasTex(size, paint, repeat = 8) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  paint(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function nrmFrom(size, amp = 28, repeat = 8) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = (i / size) | 0;
    img.data[i * 4] = 128 + Math.sin(x * 0.37 + y * 0.11) * amp;
    img.data[i * 4 + 1] = 128 + Math.cos(y * 0.41 + x * 0.09) * amp;
    img.data[i * 4 + 2] = 220;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function plasterTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#efe6d4";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) {
      const v = 210 + ((i * 17) % 35);
      g.fillStyle = `rgba(${v},${v - 8},${v - 22},0.35)`;
      g.fillRect((i * 13) % s, (i * 29) % s, 2 + (i % 3), 1 + (i % 2));
    }
    g.strokeStyle = "rgba(160,140,110,0.18)";
    g.lineWidth = 1;
    for (let y = 18; y < s; y += 22) {
      g.beginPath();
      g.moveTo(0, y + Math.sin(y) * 1.5);
      g.lineTo(s, y);
      g.stroke();
    }
  }, 6);
}

export function lateriteTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#b45a32";
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 28) {
      for (let x = (y % 56 === 0 ? 0 : -18); x < s; x += 36) {
        g.fillStyle = `rgb(${160 + (x % 40)},${70 + (y % 30)},${40 + (x % 20)})`;
        g.fillRect(x + 1, y + 1, 32, 24);
        g.strokeStyle = "rgba(80,30,16,0.45)";
        g.strokeRect(x + 1, y + 1, 32, 24);
      }
    }
  }, 4);
}

export function woodTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#6b4a28";
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x++) {
      const n = Math.sin(x * 0.2) * 12 + Math.sin(x * 0.05) * 8;
      g.strokeStyle = `rgba(${90 + n},${55 + n * 0.4},${25},0.55)`;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + n * 0.3, s);
      g.stroke();
    }
    g.fillStyle = "rgba(40,22,10,0.25)";
    for (let i = 0; i < 40; i++) g.fillRect((i * 37) % s, (i * 53) % s, 8, 2);
  }, 3);
}

export function tileTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#a33a1a";
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      const ox = (y / 16) % 2 === 0 ? 0 : 10;
      for (let x = -10; x < s; x += 20) {
        g.fillStyle = `rgb(${150 + ((x + y) % 40)},${45 + (y % 20)},${22})`;
        g.beginPath();
        g.moveTo(x + ox, y + 16);
        g.lineTo(x + ox + 10, y);
        g.lineTo(x + ox + 20, y + 16);
        g.closePath();
        g.fill();
        g.strokeStyle = "rgba(70,20,10,0.4)";
        g.stroke();
      }
    }
  }, 8);
}

export function clothTex(hex = "#d8c8a8") {
  return canvasTex(128, (g, s) => {
    g.fillStyle = hex;
    g.fillRect(0, 0, s, s);
    g.fillStyle = "rgba(255,255,255,0.08)";
    for (let y = 0; y < s; y += 4) g.fillRect(0, y, s, 1);
    g.fillStyle = "rgba(0,0,0,0.06)";
    for (let x = 0; x < s; x += 4) g.fillRect(x, 0, 1, s);
  }, 10);
}

export function skinTex(hex = "#c68642") {
  return canvasTex(128, (g, s) => {
    g.fillStyle = hex;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,220,190,${0.04 + (i % 5) * 0.01})`;
      g.fillRect((i * 19) % s, (i * 23) % s, 1, 1);
    }
  }, 2);
}

export function barkTex() {
  return canvasTex(128, (g, s) => {
    g.fillStyle = "#6a4a28";
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 6) {
      g.strokeStyle = `rgba(40,25,12,0.5)`;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 2, s);
      g.stroke();
    }
  }, 4);
}

export function leafTex() {
  return canvasTex(64, (g, s) => {
    g.fillStyle = "#2e9a48";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(20,80,30,0.4)";
    g.beginPath();
    g.moveTo(s / 2, 0);
    g.lineTo(s / 2, s);
    g.stroke();
    for (let i = 1; i < 6; i++) {
      g.beginPath();
      g.moveTo(s / 2, i * 10);
      g.lineTo(s / 2 + 18, i * 10 + 6);
      g.stroke();
    }
  }, 2);
}

export function pondTex() {
  const t = canvasTex(512, (g, s) => {
    const pts = [];
    const cols = 7, rows = 7;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const jx = ((i * 47 + j * 19) % 17) / 17;
        const jy = ((i * 13 + j * 31) % 17) / 17;
        pts.push([
          ((i + 0.5 + (jx - 0.5) * 0.72) / cols) * s,
          ((j + 0.5 + (jy - 0.5) * 0.72) / rows) * s,
        ]);
      }
    }
    const img = g.createImageData(s, s);
    const d = img.data;
    const dist2 = (x, y, px, py) => {
      let dx = Math.abs(x - px); if (dx > s / 2) dx = s - dx;
      let dy = Math.abs(y - py); if (dy > s / 2) dy = s - dy;
      return dx * dx + dy * dy;
    };
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        let b1 = 1e12, b2 = 1e12;
        for (let k = 0; k < pts.length; k++) {
          const dd = dist2(x, y, pts[k][0], pts[k][1]);
          if (dd < b1) { b2 = b1; b1 = dd; }
          else if (dd < b2) b2 = dd;
        }
        const e = Math.sqrt(b2) - Math.sqrt(b1);
        const i = (y * s + x) * 4;
        if (e < 16) {
          const u = e / 16;
          d[i] = 228 + u * 27;
          d[i + 1] = 242 + u * 13;
          d[i + 2] = 255;
        } else {
          const v = (Math.sqrt(b1) * 0.035) % 1;
          d[i] = 58 + v * 22;
          d[i + 1] = 158 + v * 24;
          d[i + 2] = 236 + v * 10;
        }
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, 1);
  t.repeat.set(1.4, 1.4);
  const im = new Image();
  im.onload = () => {
    t.image = im;
    t.needsUpdate = true;
  };
  im.src = "pond.png";
  return t;
}

export const plasterN = () => nrmFrom(128, 18, 6);
export const lateriteN = () => nrmFrom(128, 32, 4);
export const woodN = () => nrmFrom(128, 22, 3);
export const tileN = () => nrmFrom(128, 26, 8);

/** 64×64 atlas of 16×16 Minecraft-style tiles. Nearest-neighbour. */
export function mcAtlas() {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const set = (x, y, r, g, b) => {
    const i = (y * S + x) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  };
  const n = (x, y, k) => ((x * 13 + y * 37 + k * 17) % 7) - 3;
  const tile = (tx, ty, fn) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const [r, g, b] = fn(x, y);
      set(tx * 16 + x, ty * 16 + y, r, g, b);
    }
  };
  // 0,0 grass (grayscale — biome vertex colour tints it)
  tile(0, 0, (x, y) => {
    const v = 208 + n(x, y, 1) * 8;
    return [v, v, v];
  });
  // 1,0 dirt
  tile(1, 0, (x, y) => {
    const k = n(x, y, 2);
    return [134 + k * 7, 92 + k * 4, 52 + k * 2];
  });
  // 2,0 sand
  tile(2, 0, (x, y) => {
    const k = n(x, y, 3);
    return [220 + k * 4, 208 + k * 3, 148 + k * 2];
  });
  // 3,0 stone
  tile(3, 0, (x, y) => {
    const v = 118 + n(x, y, 4) * 9;
    return [v, v, v + 4];
  });
  // 0,1 grass side (green band over dirt)
  tile(0, 1, (x, y) => {
    const k = n(x, y, 5);
    if (y < 4) return [74 + k * 4, 148 + k * 5, 52 + k * 2];
    return [134 + k * 7, 92 + k * 4, 52];
  });
  // 1,1 laterite / gravel road
  tile(1, 1, (x, y) => {
    const k = n(x, y, 6);
    return [150 + k * 8, 92 + k * 4, 58 + k * 2];
  });
  // 2,1 underwater gravel
  tile(2, 1, (x, y) => {
    const k = n(x, y, 7);
    return [70 + k * 5, 88 + k * 4, 64 + k * 3];
  });
  // 3,1 packed mud
  tile(3, 1, (x, y) => {
    const k = n(x, y, 8);
    return [110 + k * 6, 78 + k * 3, 42];
  });
  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

/** Max-quality repeating ground: 512 albedo + height-derived normal + roughness. */
export function groundMaps() {
  const size = 512;
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = (Math.sin(x * 0.073) * Math.sin(y * 0.061) + 1) * 0.5;
      const n2 = (Math.sin(x * 0.31 + y * 0.19) * Math.sin(y * 0.27) + 1) * 0.5;
      const n3 = ((x * 19 + y * 47) % 23) / 23;
      const n4 = (Math.sin(x * 1.17) * Math.cos(y * 1.09) + 1) * 0.5;
      hgt[y * size + x] = n * 0.38 + n2 * 0.28 + n3 * 0.18 + n4 * 0.16;
    }
  }

  const albedo = document.createElement("canvas");
  albedo.width = albedo.height = size;
  const ag = albedo.getContext("2d");
  const aimg = ag.createImageData(size, size);
  const ad = aimg.data;
  for (let i = 0; i < size * size; i++) {
    const h = hgt[i];
    const x = i % size, y = (i / size) | 0;
    const speck = ((x * 13 + y * 29) % 11) / 11;
    const r = 198 + h * 42 + speck * 10;
    const g = 210 + h * 38 + speck * 6;
    const b = 168 + h * 28;
    ad[i * 4] = Math.min(255, r);
    ad[i * 4 + 1] = Math.min(255, g);
    ad[i * 4 + 2] = Math.min(255, b);
    ad[i * 4 + 3] = 255;
  }
  ag.putImageData(aimg, 0, 0);
  for (let i = 0; i < 14000; i++) {
    const x = (i * 47 + 13) % size;
    const y = (i * 89 + 31) % size;
    const hh = 3 + (i % 9);
    ag.strokeStyle = `rgba(${36 + (i % 40)},${110 + (i % 70)},${28 + (i % 20)},0.38)`;
    ag.lineWidth = 1;
    ag.beginPath();
    ag.moveTo(x, y);
    ag.lineTo(x + ((i % 5) - 2), y - hh);
    ag.stroke();
  }
  ag.fillStyle = "rgba(90, 70, 40, 0.18)";
  for (let i = 0; i < 900; i++) {
    ag.fillRect((i * 53) % size, (i * 97) % size, 1 + (i % 2), 1);
  }
  ag.fillStyle = "rgba(220, 80, 70, 0.28)";
  for (let i = 0; i < 80; i++) {
    ag.beginPath();
    ag.arc((i * 71) % size, (i * 113) % size, 1.2, 0, 6.3);
    ag.fill();
  }

  const map = new THREE.CanvasTexture(albedo);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(140, 140);
  map.anisotropy = 16;
  map.colorSpace = THREE.SRGBColorSpace;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;

  const nc = document.createElement("canvas");
  nc.width = nc.height = size;
  const ng = nc.getContext("2d");
  const nimg = ng.createImageData(size, size);
  const nd = nimg.data;
  const amp = 6.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const hL = hgt[y * size + ((x - 1 + size) % size)];
      const hR = hgt[y * size + ((x + 1) % size)];
      const hU = hgt[((y - 1 + size) % size) * size + x];
      const hD = hgt[((y + 1) % size) * size + x];
      let nx = (hL - hR) * amp;
      let ny = (hD - hU) * amp;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const p = i * 4;
      nd[p] = (nx * 0.5 + 0.5) * 255;
      nd[p + 1] = (ny * 0.5 + 0.5) * 255;
      nd[p + 2] = (nz * 0.5 + 0.5) * 255;
      nd[p + 3] = 255;
    }
  }
  ng.putImageData(nimg, 0, 0);
  const nrm = new THREE.CanvasTexture(nc);
  nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
  nrm.repeat.set(140, 140);
  nrm.anisotropy = 16;
  nrm.minFilter = THREE.LinearMipmapLinearFilter;
  nrm.magFilter = THREE.LinearFilter;
  nrm.generateMipmaps = true;
  nrm.needsUpdate = true;

  const rc = document.createElement("canvas");
  rc.width = rc.height = size;
  const rg = rc.getContext("2d");
  const rimg = rg.createImageData(size, size);
  const rd = rimg.data;
  for (let i = 0; i < size * size; i++) {
    const v = 170 + hgt[i] * 70;
    rd[i * 4] = v; rd[i * 4 + 1] = v; rd[i * 4 + 2] = v; rd[i * 4 + 3] = 255;
  }
  rg.putImageData(rimg, 0, 0);
  const rough = new THREE.CanvasTexture(rc);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  rough.repeat.set(140, 140);
  rough.anisotropy = 8;
  rough.needsUpdate = true;

  return { map, nrm, rough };
}

let cache = null;
export function shared() {
  if (cache) return cache;
  const G = groundMaps();
  cache = {
    plaster: plasterTex(),
    plasterN: plasterN(),
    laterite: lateriteTex(),
    lateriteN: lateriteN(),
    wood: woodTex(),
    woodN: woodN(),
    tile: tileTex(),
    tileN: tileN(),
    bark: barkTex(),
    leaf: leafTex(),
    pond: pondTex(),
    cloth: clothTex(),
    atlas: mcAtlas(),
    ground: G.map,
    groundN: G.nrm,
    groundR: G.rough,
  };
  return cache;
}
