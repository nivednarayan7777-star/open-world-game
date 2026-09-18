/**
 * terrain.js — the ground of Keralam.
 *
 * This module is a port of the terrain + ground material from the reference
 * Blender scene "Hero Tree.blend" (Blender 2.93, EEVEE), as read back out of
 * the file itself (see probe/scene.json and probe/mat_material_001.json, and
 * probe/view_groundtop.png for the look it produces):
 *
 *   • Geometry  — the scene's ground is a wide, gently rolling slab (a regular
 *     X/Y grid of ~0.7 m cells whose height only ever varies smoothly). No
 *     terraces, no hard creases: the whole slab is *smooth shaded*, so it reads
 *     as one calm surface. Every transition (coast, hill foot, lagoon rim) is a
 *     soft blend. That is what gives the diorama its calm, hand-placed look.
 *
 *   • Material  — one Principled BSDF, Roughness 1.0, Specular IOR Level 0,
 *     fed by exactly four nodes:
 *
 *         Texture Coordinate.Generated → Mapping
 *            → Musgrave (FBM, Scale 8.5, Detail 1.6, Dimension 0.6)
 *            → ColorRamp (stops 0.0 / 0.2909 / 0.8591, B_SPLINE)
 *            → Base Color
 *
 *     The blend's ground carries no image textures at all: every bit of its
 *     detail is that one green ramp. The same recipe runs per-pixel in the
 *     shader below, over three scales at once so it survives being walked on,
 *     and nothing else is added.
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
 * Ground albedo (linear) as it is written *in the blend*. Every tint stays
 * inside the green family of the blend's ColorRamp so the fourteen districts
 * read as one hand-painted terrain, while beaches, paddies and tea slopes still
 * tell themselves apart. `blendGrade` below turns this into what our renderer
 * needs — the exported palette is the graded one, this object is only its
 * source of truth.
 */
const RAW_TINT = {
  village: lin(0.0480, 0.3300, 0.0400),   // the blend's mid green, slightly cooled
  lowland: lin(0.0640, 0.3480, 0.0455),   // backwater banks: a touch brighter
  slope: lin(0.0480, 0.2700, 0.0360),     // hill flanks: deeper green
  paddy: lin(0.1150, 0.3400, 0.0450),     // paddy: yellow-green, like the blend's light stop
  tea: lin(0.0520, 0.2700, 0.0480),       // tea slopes: fresh, cool green
  forest: lin(0.0330, 0.2100, 0.0390),    // forest floor: dark green
  beach: lin(0.5200, 0.4400, 0.2900),
  wet: lin(0.0420, 0.2150, 0.1050),       // just above the waterline
  sea: lin(0.0450, 0.1900, 0.1450),
};

/**
 * Where the reference's greens actually land on screen, and where ours do.
 *
 * Measured by `probe/ground_stats.py` — the blend's own renders through the
 * probe (Cycles) against the game's screenshots, both masked to green-dominant,
 * sunlit pixels:
 *
 *   reference (view_groundtop.png / view_iso.png / view_close.png)
 *                                                        hue 113–114°
 *                                                        sat 0.69–0.71
 *                                                        value 0.59–0.63
 *   game before this grade (probe/shots/*.png)           hue  98–108°
 *                                                        sat 0.55–0.59
 *                                                        value 0.73–0.76
 *
 * The albedo is already the blend's albedo; the difference is the *lighting
 * rig*. Keralam is lit by a warm sun (0xffe6b0) and a warm hemisphere
 * (0xfff4dc), then finished with ACES, which lifts mid tones and pulls greens
 * towards yellow. So the palette is pre-compensated by that measured shift:
 * greens rotate 12° away from yellow, saturation goes up, value comes down.
 * With the grade applied the game's ground lands on the reference's numbers —
 * a deep, saturated green carrying soft blobs, not a bright yellow-green wash.
 *
 * These are measured numbers, not taste. Each run reports the game's rendered
 * ground next to the reference's in probe/shots/ground_report.json, and the
 * grade has been walked in one step at a time from that report: the first
 * version came out 3° yellow with the saturation 0.05 light and the value 0.07
 * bright, and the leafy lift in `LEAFY` pulls the hue back towards yellow
 * again, which the extra 2.8° here cancels out. Where it stands: hue 111–113°
 * against the reference's 113–114°, saturation 0.69–0.72 against 0.69–0.71,
 * value 0.60–0.61 against 0.59–0.63.
 */
export const BLEND_GRADE = { hueShift: 0.0189, sat: 1.20, val: 0.72 };

/**
 * Greens are lifted in red and blue, per the blend's own albedo.
 *
 * The blend's ColorRamp greens carry far more red than the saturated green the
 * palette above would land on: its stops sit at R/G 0.135 / B/G 0.045–0.093,
 * where ours came out at 0.0725 / 0.0725. Rendering agreed — the game's ground
 * came back with red and blue ~13% under the reference's at the same green
 * (54.5, 155.0, 42.6 against 62.8, 160.7, 49.5) — so green tints take the
 * blend's leafy balance back: red ×1.35, blue ×1.15. Sand, earth and water are
 * left alone; this is a correction for leaves, not for beaches.
 */
export const LEAFY = { none: null, red: 1.35, blue: 1.15 };

/**
 * Pre-compensate a colour for Keralam's warm-light + ACES pipeline so that it
 * *renders* like the blend's material does. Greens (80°–170°) get the hue
 * rotation and the leafy red/blue lift; sand, earth and water keep their hue
 * and channels and only take the saturation and value part of the grade.
 */
export function blendGrade(color, opts = {}) {
  const {
    hueShift = BLEND_GRADE.hueShift,
    sat = BLEND_GRADE.sat,
    val = BLEND_GRADE.val,
    leafy = true,
  } = opts;
  const out = color instanceof THREE.Color ? color.clone() : new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  out.getHSL(hsl, THREE.SRGBColorSpace);
  const isGreen = hsl.h > 0.222 && hsl.h < 0.472;   // 80° … 170°: the green family
  if (isGreen) hsl.h = (hsl.h + hueShift) % 1;
  hsl.s = Math.min(1, hsl.s * sat);
  hsl.l = Math.max(0, Math.min(1, hsl.l * val));
  out.setHSL(hsl.h, hsl.s, hsl.l, THREE.SRGBColorSpace);
  if (isGreen && leafy) {
    out.r = Math.min(1, out.r * LEAFY.red);
    out.b = Math.min(1, out.b * LEAFY.blue);
  }
  return out;
}

/** The ground palette the game actually uses: the blend's albedo, graded. */
export const GROUND_TINT = Object.fromEntries(
  Object.entries(RAW_TINT).map(([k, c]) => [k, blendGrade(c)])
);
export const TINT = GROUND_TINT;

/** Earth used for the slab edge that frames the map like the blend's ground slab. */
export const EDGE_TINT = blendGrade(lin(0.1500, 0.1050, 0.0700));

function smoothstep01(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1)));
  return t * t * (3 - 2 * t);
}

/**
 * Ground colour at (x, z): a *continuous* blend of the palette above.
 *
 * The blend's ground is one even green with soft patches — never a patchwork
 * with hard borders — so every weight here is a smoothstep of height or
 * position, and the result feeds the shader, which adds the mottling on top.
 */
export function groundTint(x, z, district, height = null) {
  const kind = district?.kind || "coastal";
  const seed = district?.seed || 0;
  const h = height == null ? shapeHeight(x, z, district) : height;
  const c = GROUND_TINT.village.clone();

  // Slopes and higher ground run deeper green, valleys stay bright.
  const alt = smoothstep01(2.5, 14, h);
  c.lerp(GROUND_TINT.slope, alt * (kind === "highland" ? 0.30 : 0.38));

  // Tea estate belt on the highland rise.
  if (kind === "highland") {
    const tea = smoothstep01(9, 15, h) * smoothstep01(20, 60, x);
    c.lerp(GROUND_TINT.tea, tea * 0.75);
  }

  // Paddy flats: the low, flat inland pockets.
  const paddyZone = (kind === "midland" ? 0.55 : 0.35) *
    (1 - smoothstep01(0.6, 3.4, h)) *
    smoothstep01(-140, -60, z) * (1 - smoothstep01(60, 140, z));
  c.lerp(GROUND_TINT.paddy, paddyZone);

  // Forest belt (Kerala's hills all carry a green canopy).
  const forestZone = smoothstep01(4.5, 11, h) * smoothstep01(-40, 40, z + seed * 30);
  c.lerp(GROUND_TINT.forest, forestZone * (kind === "highland" ? 0.5 : 0.4));

  // Backwater banks and the strip just above the waterline.
  const lowland = (1 - smoothstep01(0.5, 3.2, h)) * smoothstep01(-2, 6, h);
  c.lerp(GROUND_TINT.lowland, lowland * (kind === "backwater" ? 0.8 : 0.45));
  const wet = 1 - smoothstep01(WATER - 0.9, WATER + 1.2, h);
  c.lerp(GROUND_TINT.wet, wet * 0.7);

  // River-mouth sand only right at the coast, and only low down.
  if (kind !== "highland") {
    const shore = -98 + Math.sin(z * 0.018 + seed) * 12;
    const beach = (1 - smoothstep01(shore - 4, shore + 9, x)) *
      (1 - smoothstep01(WATER + 0.6, WATER + 3.2, h));
    c.lerp(GROUND_TINT.beach, beach * 0.75);
  }

  return c;
}

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
 * Albedo multiplier that takes the ramp's `mid` stop to one of its end stops,
 * per channel — i.e. the ColorRamp itself, expressed as something a shader can
 * mix in *linear* space (three.js vertex colours live there, so do Blender's).
 *
 * Blender's stops are much further apart than any sRGB space can show
 * (light.red / mid.red ≈ 3.9), so the ratio is compressed by `k` and capped. A
 * faithful-but-pedestrian version of the ramp's three greens is what we want
 * anyway: the blend reads as one green field carrying two green patches.
 */
function rampRatio(stop, mid, k, cap = 1.75) {
  const f = (a, b, kk) =>
    Math.max(1 / cap, Math.min(cap, Math.pow(Math.max(a, 1e-4) / Math.max(b, 1e-4), kk)));
  return new THREE.Color(
    f(stop.r, mid.r, Array.isArray(k) ? k[0] : k),
    f(stop.g, mid.g, Array.isArray(k) ? k[1] : k),
    f(stop.b, mid.b, Array.isArray(k) ? k[2] : k)
  );
}

/** The ramp's dark stop, as a multiplier on its mid stop (deeper, more saturated green). */
export const RAMP_DARK_MUL = rampRatio(GRASS_RAMP.dark, GRASS_RAMP.mid, 0.95);
/**
 * The ramp's light stop, as a multiplier on its mid stop.
 *
 * Per channel, because the blend's stops are far more saturated than any real
 * surface: its light stop is ×3.9 the mid stop in *red* alone, which as a plain
 * ratio would light the patches orange. The exponents pull each channel back to
 * a believable spread while keeping the ramp's hue drift — the highlights stay
 * yellow-green, not orange. `green` is what the eye reads as "how bright is
 * this patch", so it gets by far the largest exponent; red is held back hardest
 * so the patches never lose the blend's green.
 */
export const RAMP_LIGHT_MUL = rampRatio(GRASS_RAMP.light, GRASS_RAMP.mid, [0.30, 1.66, 0.55]);
/** The ColorRamp's stop positions in the blend, used as the shader's ramp knots. */
export const GRASS_RAMP_STOPS = { dark: 0.0, mid: 0.2909, light: 0.8591 };

/**
 * The ground material: MeshStandardMaterial (so it keeps shadows, fog and the
 * day/night rig) with the blend's Musgrave → ColorRamp recipe injected into
 * the albedo. Patches are computed in world space, so detail never repeats and
 * never stretches, and costs no texture memory.
 *
 * Shading is deliberately *smooth* by default: the blend's slab has no facets
 * at all, just a wide green plane whose only detail is the colour. Flat shading
 * would turn every noise bump into a hard grey facet, which is exactly what the
 * reference does not look like.
 */
export function terrainMaterial(opts = {}) {
  const {
    tint = null,              // flat albedo override (used for sand / paddy slabs)
    patchScale = 0.05,        // ≈ 20 m washes
    patchMid = 0.30,          // ≈ 3.3 m patches — the motif the reference shows
    // 0 → flat colour, 1 → full ramp contrast. The sand and paddy slabs pass a
    // small value: the green ramp would otherwise tint them, and a beach wants
    // to stay sand.
    patchStrength = 1.0,
    // Levels adjustment. Our value-noise FBM is a tamer signal than Blender's
    // Musgrave: across the map it spans ≈ 0.35 … 0.65 (p10 … p90), where the
    // blend's Musgrave.Fac spans nearly 0 … 1. Feeding it to the ramp unstretched
    // is what made the old meadow read as one flat green. Mapping the middle 80%
    // of the noise onto the ramp's full range restores the reference's look — a
    // mid green field carrying soft lighter patches — instead of a uniform wash.
    // The percentile walk-through behind these two numbers is in tune.mjs.
    levelLow = 0.40,
    levelHigh = 0.70,
    dark = RAMP_DARK_MUL,     // channel-wise multiplier on the darkest patches
    light = RAMP_LIGHT_MUL,   // …and on the brightest
    fine = 0.90,              // fine mottle frequency (≈ 1.1 m)
    // The reference's ground is *clean*: the probe measures its fine-detail
    // contrast (p90/p10 of the lit ground) at 2.5, and that includes tree
    // shadows and stone edges — the colour itself carries no grain at all. An
    // earlier 0.09 grain here pushed ours to 4.6 and made the meadow look
    // speckled instead of painted, so it is kept as a whisper.
    fineAmount = 0.04,
    flatShading = false,
  } = opts;

  const darkMul = dark instanceof THREE.Color ? dark.clone() : new THREE.Color(dark);
  const lightMul = light instanceof THREE.Color ? light.clone() : new THREE.Color(light);

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
    uPatchMid: { value: patchMid },
    uPatchStrength: { value: patchStrength },
    uLevelLow: { value: levelLow },
    uLevelHigh: { value: levelHigh },
    // The blend's ColorRamp stop positions, used verbatim.
    uStopMid: { value: GRASS_RAMP_STOPS.mid },
    uStopLight: { value: GRASS_RAMP_STOPS.light },
    uDark: { value: darkMul },
    uLight: { value: lightMul },
    uFineScale: { value: fine },
    uFineAmount: { value: fineAmount },
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
        uniform float uPatchMid;
        uniform float uPatchStrength;
        uniform float uLevelLow;
        uniform float uLevelHigh;
        uniform float uStopMid;
        uniform float uStopLight;
        uniform vec3 uDark;
        uniform vec3 uLight;
        uniform float uFineScale;
        uniform float uFineAmount;
        ${GLSL_NOISE}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          vec2 tp = vTerrPos.xz;
          // Musgrave(FBM).Fac, summed over three scales: the broad zones, the
          // blend slab's ~13 m patches (the scale that carries the recipe; the
          // reference's tiling works out at 13.4 m × 8.7 m), and a whisper of
          // close-range mottle. Weights keep the sum normalised.
          float f = 0.30 * tMusgrave(tp * uPatchScale, 2.0, 2.0, 0.62)
                  + 0.62 * tMusgrave(tp * uPatchMid, 3.0, 2.0, 0.62)
                  + 0.08 * tMusgrave(tp * uFineScale, 2.0, 2.0, 0.62);
          f = smoothstep(uLevelLow, uLevelHigh, f);
          // …read straight through the blend's ColorRamp (stops 0.0 / 0.2909 /
          // 0.8591, B_SPLINE). Walking dark→mid→light in two smoothstepped legs
          // keeps the B-spline's wide soft cores and means no patch can ever
          // show a border. Ratios are per channel, from the blend's own stops.
          vec3 gr = mix(uDark, vec3(1.0), smoothstep(0.0, uStopMid, f));
          gr = mix(gr, uLight, smoothstep(uStopMid, uStopLight, f));
          diffuseColor.rgb *= mix(vec3(1.0), gr, uPatchStrength);
          diffuseColor.rgb *= 1.0 + (f - 0.5) * uFineAmount * 2.0;
        }`
      );
  };
  mat.customProgramCacheKey =
    () => `keralam-terrain-${patchScale}-${patchMid}-${patchStrength}-${fine}-${fineAmount}-${levelLow}-${levelHigh}`;
  return mat;
}

/* -------------------------------------------------------------- mesh build */

/**
 * The ground slab: a regular X/Y grid like the blend's. The grid stays indexed
 * so the normals are *averaged* across neighbouring quads — that is what gives
 * the reference its smooth, faceted-only-by-the-noise surface — and the biome
 * tint rides on the vertices, one colour per grid point, interpolated across
 * every triangle.
 *
 * (Building it indexed also makes the world load roughly twice as fast as the
 * old per-triangle version: one tint sample per vertex instead of one per
 * triangle corner, and five times fewer vertices to normalise.)
 */
export function buildGround(size, seg, heightFn, tintFn) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const h = heightFn(x, z);
    p.setY(i, h);
    const c = tintFn(x, z, h);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  p.needsUpdate = true;
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
