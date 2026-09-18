/**
 * terrain.js — the ground of Keralam.
 *
 * This module is a straight port of the terrain + ground material from the
 * reference Blender scene "Hero Tree.blend" (Blender 2.93, EEVEE):
 *
 *   • Geometry  — the scene's ground is a wide, gently rolling slab (a regular
 *     X/Y grid of ~0.7 m cells whose height only ever varies smoothly). No
 *     terraces, no hard creases: slopes stay inside a few degrees and every
 *     transition (coast, hill foot, lagoon rim) is a soft blend. That is what
 *     gives the diorama its calm, hand-placed look, so it is what we build here.
 *
 *   • Material  — one Principled BSDF, Roughness 1.0, Specular 0.0, driven by
 *     Musgrave(FBM) → ColorRamp with a B-spline blend over a three stop green
 *     ramp. The same recipe is reproduced per-pixel in the shader below:
 *     large soft patches of dark green ↔ bright yellow-green, plus a faint
 *     fine-grain speckle. Nothing else — the blend's ground has no textures.
 *
 * The Blender colour stops are linear RGB, which is exactly the space three.js
 * vertex colours and shader colours live in, so they can be used verbatim.
 */

import * as THREE from "three";

/* ------------------------------------------------------------------ palette */

/** Linear-RGB helper (three.js working colour space). */
export const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);

/**
 * The three stop green ramp from the blend (Material.001 → ColorRamp).
 * pos 0.0 → 0.2909 → 0.8591, B_SPLINE interpolation.
 */
export const GRASS_RAMP = {
  dark: lin(0.0212, 0.3050, 0.0137),
  mid: lin(0.0595, 0.4397, 0.0409),
  light: lin(0.2346, 0.5149, 0.0513),
};

/** Musgrave FBM settings from the blend's ground material. */
export const MUSGRAVE = { scale: 8.5, detail: 1.6, dimension: 0.6, lacunarity: 2.0, gain: 1.0 };

/**
 * Biome albedo (linear). Every tint sits in the same green family as the ramp
 * above so the fourteen districts read as one hand-painted terrain while the
 * player can still tell beach from paddy from tea.
 */
export const GROUND_TINT = {
  village: lin(0.0730, 0.3280, 0.0500),
  paddy: lin(0.1500, 0.3800, 0.0560),
  tea: lin(0.0560, 0.2760, 0.0560),
  forest: lin(0.0420, 0.2300, 0.0520),
  beach: lin(0.5200, 0.4400, 0.2900),
  backwater: lin(0.0620, 0.3050, 0.0980),
  sea: lin(0.0500, 0.2050, 0.1550),
};
export const TINT = GROUND_TINT;

/** Earth used for the slab edge that frames the map like the blend's ground slab. */
export const EDGE_TINT = lin(0.1500, 0.1050, 0.0700);

export const WATER = 0.42;
export const SIZE = 420;

/* ------------------------------------------------------------------- noise */

function hash2(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/** Smooth value noise on the integer lattice (same routine the blend's look needs). */
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm2(x, z, octaves = 4) {
  let v = 0, a = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += a * noise2(x, z);
    norm += a;
    x = x * 2.03 + 17.3;
    z = z * 2.03 - 9.1;
    a *= 0.5;
  }
  return v / norm;
}

/**
 * Blender's Musgrave "FBM" fractal, as used by the blend's ground material.
 * `dimension` is the fractal dimension (fractal 0.6 → roughness 0.4).
 */
export function musgraveFbm(x, y, z, o = MUSGRAVE) {
  const H = Math.max(0.05, o.dimension);
  const roughness = Math.max(0, Math.min(1, H));
  const gain = Math.pow(o.gain, roughness);
  let value = 0, amplitude = 1, freq = o.scale, norm = 0;
  const octaves = Math.max(1, Math.round(o.detail));
  for (let i = 0; i < octaves; i++) {
    value += amplitude * (noise2(x * freq, y * freq) * 2 - 1) * 0.5 + amplitude * 0.5;
    norm += amplitude;
    amplitude *= gain * o.gain;
    freq *= o.lacunarity;
  }
  return value / Math.max(norm, 1e-4);
}

/** Soft min — used instead of Math.min so the shoreline is a blend, not a crease. */
function smin(a, b, k = 1.6) {
  const h = Math.max(0, Math.min(1, 0.5 + (b - a) / (2 * k)));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1)));
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------- shape */

/**
 * Height of the ground at (x, z) for a district (`kind`, `seed`).
 *
 * Character notes, all taken from the blend:
 *   – two octave broad relief plus two octave "rolling meadow" relief, all of
 *     it smooth and low amplitude (≈1–3 m over 20–60 m),
 *   – inland rise towards the Ghats as a smooth ramp (never a stepped terrace),
 *   – coast and backwaters sinking through a soft-min so the waterline is a
 *     clean, gentle beach instead of a cliff.
 */
export function shapeHeight(x, z, district) {
  const seed = district?.seed || 0;
  const kind = district?.kind || "coastal";

  const n = fbm2(x * 0.012 + seed, z * 0.012, 4);
  const n2 = fbm2(x * 0.04 + 30 + seed, z * 0.04, 3);

  // Rolling meadow relief — the calm, hand-shaped undulation of the blend slab.
  const roll = (fbm2(x * 0.052 + seed * 3.1, z * 0.052 - seed * 1.7, 3) - 0.5) * 1.7;
  const micro = (fbm2(x * 0.145 - seed * 2.3, z * 0.145 + seed * 4.4, 2) - 0.5) * 0.42;

  if (kind === "highland") {
    // Tea country: long smooth slopes up to the ridge, no terracing.
    let h = 6.2 + n * 4.5 + n2 * 1.8 + roll * 1.6 + micro;
    if (x > 16) {
      const t = smoothstep(16, 166, x);
      h += t * (11 + n * 7 + n2 * 3);
    }
    if (z > 90) h += smoothstep(90, 190, z) * (6 + n2 * 5);
    return h;
  }

  const shore = -98 + (n - 0.5) * 16 + Math.sin(z * 0.018 + seed) * 12;
  const distInland = x - shore;
  const lagoonX = -50 + Math.sin(z * 0.028 + seed) * 16;
  const lagoon =
    Math.exp(-((x - lagoonX) * (x - lagoonX)) / (kind === "backwater" ? 480 : 620)) *
    (kind === "backwater" ? 0.85 : 0.45) *
    (0.5 + 0.5 * Math.abs(Math.sin(z * 0.016)));

  // Inland rise, as a smooth ramp (the blend never steps its ground).
  let hills = 0;
  const hillStart = kind === "midland" ? 36 : 48;
  if (x > hillStart) {
    const t = smoothstep(hillStart, hillStart + 170, x);
    hills = t * t * ((kind === "midland" ? 10 : 16) + n * 14 + n2 * 7);
  }

  const north = z > 100 ? smoothstep(100, 190, z) * (5 + n * 4) : 0;

  let h = 1.35 + n * 2.2 + n2 * 0.7 + hills + north + roll + micro;
  h -= lagoon * (kind === "backwater" ? 6.2 : 4.4);

  if (kind === "midland") {
    if (distInland < -30) h = smin(h, distInland * 0.08 - 0.4, 1.1);
    else if (distInland < 10) {
      const t = smoothstep(-30, 10, distInland);
      h = h * t + 0.7 * (1 - t);
    }
    return h;
  }

  // Coastal: beach slope into the sea, blended rather than clamped.
  if (distInland < 0) h = smin(h, distInland * 0.14 - 1.8, 1.3);
  else if (distInland < 20) {
    const t = smoothstep(0, 20, distInland);
    h = h * t + 0.55 * (1 - t);
  }
  return h;
}

/* ------------------------------------------------------------------ shader */

const GLSL_NOISE = /* glsl */ `
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x),
             mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Blender Musgrave FBM: lacunarity 2, gain 1, fractal detail from "dimension".
float tMusgrave(vec2 p, float octaves, float lacunarity, float gain) {
  float v = 0.0, amp = 1.0, norm = 0.0;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= octaves) break;
    v += amp * tNoise(p);
    norm += amp;
    p *= lacunarity;
    p += vec2(17.3, -9.1);
    amp *= gain;
  }
  return v / max(norm, 1e-4);
}
`;

/**
 * The ground material: MeshStandardMaterial (so it keeps shadows, fog and the
 * day/night rig) with the blend's Musgrave → ColorRamp recipe injected into
 * the albedo. Patches are computed in world space, so detail never repeats and
 * never stretches, and costs no texture memory.
 */
export function terrainMaterial(opts = {}) {
  const {
    tint = null,              // flat albedo override (used for sand / paddy slabs)
    patchScale = 0.048,       // ≈ 21 m soft patches, as in the blend's slab
    patchContrast = 0.42,
    dark = 0.70,              // albedo multiplier on the darkest patches
    light = 1.30,             // …and on the brightest
    fine = 0.42,              // fine grain frequency (≈ 2.4 m)
    fineAmount = 0.10,
    flatShading = true,
  } = opts;

  const mat = new THREE.MeshStandardMaterial({
    color: tint ? tint.clone() : new THREE.Color(0xffffff),
    vertexColors: !tint,
    roughness: 1.0,           // the blend's ground is fully diffuse…
    metalness: 0.0,           // …and has Specular IOR Level 0 (no sheen)
    flatShading,
    dithering: true,
  });

  const uniforms = {
    uPatchScale: { value: patchScale },
    uPatchContrast: { value: patchContrast },
    uDark: { value: dark },
    uLight: { value: light },
    uFineScale: { value: fine },
    uFineAmount: { value: fineAmount },
    uWarm: { value: GRASS_RAMP.light.clone() },
  };
  mat.userData.uniforms = uniforms;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTerrPos;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vTerrPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vTerrPos;
        uniform float uPatchScale;
        uniform float uPatchContrast;
        uniform float uDark;
        uniform float uLight;
        uniform float uFineScale;
        uniform float uFineAmount;
        uniform vec3 uWarm;
        ${GLSL_NOISE}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          vec2 tp = vTerrPos.xz;
          // Big soft patches: Musgrave(FBM) → ColorRamp, B-spline smooth.
          float m = tMusgrave(tp * uPatchScale, 3.0, 2.0, 0.62);
          m = smoothstep(0.30, 0.86, m);
          m = mix(0.5, m, uPatchContrast + 0.58);
          diffuseColor.rgb *= mix(uDark, uLight, m);
          // Bright patches lean yellow-green, exactly like the ramp's light stop.
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uWarm * 3.1, m * 0.30);
          // Faint fine grain so the ground still reads up close.
          float g = tMusgrave(tp * uFineScale, 2.0, 2.0, 0.62);
          diffuseColor.rgb *= 1.0 + (g - 0.5) * uFineAmount * 2.0;
        }`
      );
  };
  mat.customProgramCacheKey = () => `keralam-terrain-${patchScale}-${patchContrast}-${dark}-${light}`;
  return mat;
}

/* -------------------------------------------------------------- mesh build */

/**
 * The ground slab: a regular X/Y grid like the blend's, with the vertex colour
 * carrying the biome tint and the material carrying the procedural greens.
 */
export function buildGround(size, seg, heightFn, tintFn) {
  let geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightFn(p.getX(i), p.getZ(i)));
  geo = geo.toNonIndexed();
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const c = tintFn(x, z);
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = c.r;
      colors[(i + k) * 3 + 1] = c.g;
      colors[(i + k) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * The slab edge: a short skirt under the map border so the world reads as a
 * finished diorama slab (and so the sea does not show the underside).
 */
export function buildSkirt(size, seg, heightFn, tint = EDGE_TINT) {
  const half = size / 2;
  const positions = [];
  const colors = [];
  const depth = 9;
  const corners = [
    [-half, -half], [half, -half], [half, half], [-half, half],
  ];
  for (let side = 0; side < 4; side++) {
    const [x0, z0] = corners[side];
    const [x1, z1] = corners[(side + 1) % 4];
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg;
      const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0;
      const bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
      const ay = heightFn(ax, az) - 0.25;
      const by = heightFn(bx, bz) - 0.25;
      const ay2 = ay - depth, by2 = by - depth;
      const shade = (t) => 0.72 + 0.28 * Math.sin(t * Math.PI);
      const c0 = shade(t0), c1 = shade(t1);
      const quad = [
        [ax, ay, az, c0], [bx, by, bz, c1], [bx, by2, bz, c1 * 0.55],
        [ax, ay, az, c0], [bx, by2, bz, c1 * 0.55], [ax, ay2, az, c0 * 0.55],
      ];
      for (const [px, py, pz, k] of quad) {
        positions.push(px, py, pz);
        colors.push(tint.r * k, tint.g * k, tint.b * k);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
